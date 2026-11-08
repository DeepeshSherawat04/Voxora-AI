"""
tools.py  -  STEP 3 of LangChain: TOOLS.

WHAT IS A TOOL?
    A normal Python function that the LLM is ALLOWED to ask us to run.
    The LLM cannot run code itself. It only says:
        "please call calculate_quote with users=15"
    and OUR code runs the function and gives the answer back.

WHY DO WE NEED TOOLS?
    LLMs are bad at exact maths and cannot touch our database.
    A tool gives it a safe, controlled way to do real work.

VERY IMPORTANT - THE DOCSTRING IS NOT JUST A COMMENT:
    The @tool decorator sends each function's docstring to the LLM.
    That is how the LLM decides WHEN to use the tool. So write the docstring
    like you are explaining the tool to a new teammate.
"""

from langchain_core.tools import tool

# Single source of truth for the price (same number as the product brief).
PRICE_PER_USER_PER_MONTH = 799


@tool
def calculate_quote(users: int, months: int = 12) -> str:
    """Calculate the total CloudDesk CRM price for a team.

    Use this when the customer tells you their team size and wants the cost.
    users  = number of people on the sales team.
    months = how many months (default 12).
    """
    # We do the maths in Python, so the answer is always exact (LLMs can slip).
    total = users * months * PRICE_PER_USER_PER_MONTH
    return (
        f"{users} users x {months} months x Rs {PRICE_PER_USER_PER_MONTH} "
        f"= Rs {total:,} in total."
    )


@tool
def lookup_feature(question: str) -> str:
    """Look up a CloudDesk CRM feature to answer a customer's question.

    Use this when the customer asks what the product can do.
    """
    # A tiny fake "database" for now. Later we replace this with our RAG search.
    features = {
        "whatsapp": "WhatsApp integration: send and track messages from inside the CRM.",
        "reminder": "Automatic follow-up reminders so no lead is forgotten.",
        "pipeline": "One shared sales pipeline for the whole team, no version conflicts.",
        "setup": "Setup takes about 5 minutes.",
    }
    q = question.lower()
    for keyword, answer in features.items():
        if keyword in q:
            return answer
    return "I don't have that feature in my brief. Offer a free demo instead."


@tool
def book_demo(customer_name: str, preferred_time: str) -> str:
    """Book a free live demo for the customer.

    WARNING: this changes the real world (it creates a booking).
    In LangGraph we will put a HUMAN APPROVAL step in front of this tool.
    """
    # For now we only pretend. Later this could write to the database.
    return f"Demo booked for {customer_name} at {preferred_time}."


# One list so other files can import all tools together.
ALL_TOOLS = [calculate_quote, lookup_feature, book_demo]


# Quick test:  python -m app.langchain_core.tools
if __name__ == "__main__":
    # You can run a tool yourself with .invoke() and a dictionary of inputs.
    print(calculate_quote.invoke({"users": 15, "months": 12}))

    # This is what the LLM sees about a tool (name, description, inputs):
    print(calculate_quote.name, "|", calculate_quote.description)
    print(calculate_quote.args)

    # Now let the MODEL choose a tool. .bind_tools() = "tell the model these tools exist".
    from app.langchain_core.llm import get_llm

    llm_with_tools = get_llm(0).bind_tools(ALL_TOOLS)
    answer = llm_with_tools.invoke("We have 15 salespeople. What is the yearly cost?")

    # The model did NOT run the tool. It only REQUESTED it:
    print(answer.tool_calls)  # -> [{'name': 'calculate_quote', 'args': {'users': 15, 'months': 12}, ...}]