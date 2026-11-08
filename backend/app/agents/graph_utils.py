"""
graph_utils.py  -  small helpers shared by ALL our LangGraph agents.

1. get_checkpointer()  -> where a paused graph saves its state.
2. pending_interrupt() -> "is this graph waiting for a human? what is it asking?"
"""

import os
from functools import lru_cache

from langgraph.checkpoint.memory import MemorySaver


@lru_cache(maxsize=1)   # lru_cache = build it only ONCE, then reuse the same object
def get_checkpointer():
    """
    WHAT IS A CHECKPOINTER?
        A checkpointer saves the graph's STATE (the shared notebook) after every
        step. This is what lets a graph PAUSE (wait for a human) and RESUME later,
        even many minutes after.

    TWO OPTIONS:
        MemorySaver  -> keeps the state in RAM. Easy for learning, but if the
                        server restarts, every paused approval is LOST.
        PostgresSaver -> keeps the state in PostgreSQL. Survives restarts.
                        This is the "failure recovery" answer for production.

    We pick automatically: if CHECKPOINT_DB_URL is set in .env, use Postgres.
    Example:  CHECKPOINT_DB_URL=postgresql://user:password@localhost:5432/voxora
    (Use a plain "postgresql://" address, not the "postgresql+psycopg2://" one
    that SQLAlchemy uses.)
    """
    db_url = os.getenv("CHECKPOINT_DB_URL")
    if not db_url:
        return MemorySaver()

    # Imported here so people who only use MemorySaver do not need these packages.
    from langgraph.checkpoint.postgres import PostgresSaver
    from psycopg_pool import ConnectionPool

    # A "connection pool" = a small group of ready database connections we reuse.
    pool = ConnectionPool(
        conninfo=db_url,
        max_size=5,
        kwargs={"autocommit": True, "prepare_threshold": 0},
        open=True,
    )
    saver = PostgresSaver(pool)
    saver.setup()   # creates the checkpoint tables if they do not exist yet
    return saver


def pending_interrupt(graph, config: dict):
    """
    Return what the graph is waiting for, or None if it is not paused.

    When a node calls interrupt({...}), the graph stops. The dictionary we
    passed to interrupt() is stored in the saved state. This function reads it
    back, so our API can show it to a human (for example: the email draft).
    """
    snapshot = graph.get_state(config)      # the latest saved state of this run
    for task in snapshot.tasks:             # each unfinished step is a "task"
        if task.interrupts:
            return task.interrupts[0].value
    return None