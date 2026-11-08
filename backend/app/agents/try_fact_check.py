"""
try_fact_check.py  -  a small test that shows the checking system really works.

WHY THIS TEST?
    In a normal run the writer is already good, so the checkers say "passed"
    every time and we never SEE them catch anything. Here we give them emails
    that we wrote ON PURPOSE with mistakes. If the system works, it must:
        - PASS the clean email
        - FAIL every email that has an invented claim

THE SYSTEM HAS TWO LAYERS (the same two the real graph uses):
    1. rules  -> find_rule_problems(): plain Python, same answer every time.
    2. judge  -> fact_chain: an LLM that compares the email with PRODUCT_FACTS.
    An email is "caught" if EITHER layer flags it.
    The "caught by" column shows which layer fired. If the judge misses
    something that the rules catch, the system is still safe, but the judge
    prompt can be improved.

Run it with:   python -m app.agents.try_fact_check
(Run it as a file. Do not paste this code into the terminal.)
"""

from app.agents.followup_agent import PRODUCT_FACTS, fact_chain, find_rule_problems

# What the call was about (this is "allowed" because the customer said it).
CALL_DETAILS = (
    "Customer: Rahul\n"
    "Summary: Rahul's team of 12 uses Excel and wants to talk to the team first.\n"
    "Customer needs: shared pipeline for 12 salespeople\n"
    "Agreed next steps: send details by email and follow up in 2-3 days"
)

# (name, should the system PASS it?, email text)
TEST_EMAILS = [
    ("clean email", True,
     "Hi Rahul, CloudDesk has one shared pipeline, WhatsApp integration and automatic "
     "follow-up reminders. Our Growth plan is Rs 799 per user per month. "
     "I can arrange a free live demo this week, no commitment. I will follow up in 2-3 days."),

    ("invented feature", False,
     "Hi Rahul, CloudDesk offers multi-user access, a shared pipeline and WhatsApp integration. "
     "The Growth plan is Rs 799 per user per month."),

    ("invented contract term", False,
     "Hi Rahul, our Growth plan is Rs 799 per user per month with no commitment, "
     "so you can cancel any time."),

    ("invented discount", False,
     "Hi Rahul, we can give your team of 12 a 10% discount on the Growth plan at Rs 799 per user."),

    ("invented attachment", False,
     "Hi Rahul, I have attached our full pricing sheet and a case study for your team."),

    ("invented deadline", False,
     "Hi Rahul, the Growth plan is Rs 799 per user per month. This offer is valid until Friday."),

    ("invented link", False,
     "Hi Rahul, you can book a demo here: calendly.com/clouddesk/demo."),

    ("promise to send later", False,
     "Hi Rahul, the Growth plan is Rs 799 per user per month. I'll send the full product overview shortly."),
]


if __name__ == "__main__":
    correct = 0
    for name, should_pass, email in TEST_EMAILS:
        # Layer 1: plain-Python rules.
        rule_hits = find_rule_problems(email)

        # Layer 2: the LLM judge.
        verdict = fact_chain.invoke({
            "facts": PRODUCT_FACTS,
            "call_details": CALL_DETAILS,
            "email": email,
        })

        # The system catches an email if EITHER layer flags it.
        caught = bool(rule_hits) or not verdict.all_supported
        ok = (not caught) == should_pass      # did the system give the RIGHT verdict?
        correct += ok

        by = []
        if rule_hits:
            by.append("rules")
        if not verdict.all_supported:
            by.append("judge")

        print(f"{'OK ' if ok else 'BAD'}  {name:24s} "
              f"{'FAIL' if caught else 'PASS'}  | caught by: {', '.join(by) or '-'}")
        if not ok:
            print(f"       rules said: {rule_hits or 'nothing'}")
            print(f"       judge said: {verdict.unsupported}")

    print(f"\nSystem was right on {correct}/{len(TEST_EMAILS)} emails")