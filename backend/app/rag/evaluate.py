# backend/app/rag/evaluate.py
from rag_pipeline import retrieve, rerank

TEST_CASES = [
    # ---- The 12 from Section 9 ----
    {"q": "What does CloudDesk CRM do?",
     "sections": ["product_overview", "features_and_value"],
     "keywords": ["shared", "pipeline", "WhatsApp"]},

    {"q": "Price kya hai per user?",
     "sections": ["pricing_and_offer"],
     "keywords": ["799", "per user"]},

    {"q": "How much would it cost for 15 users?",
     "sections": ["pricing_and_offer"],
     "keywords": ["799", "per user"]}, 

    {"q": "We use Excel. Why should we change?",
     "sections": ["objection_handling", "product_overview", "customer_fit_and_discovery"],
     "keywords": ["Excel", "shared"]},

    {"q": "Can you guarantee a five-minute setup?",
     "sections": ["product_overview", "features_and_value"],
     "keywords": ["five minutes", "setup"]},

    {"q": "Does it integrate with Salesforce?",
     "sections": ["knowledge_boundaries"],
     "keywords": ["Integrations beyond WhatsApp"]},

    {"q": "Do you offer a free trial?",
     "sections": ["pricing_and_offer", "demo_and_buying_intent"],
     "keywords": ["trial", "demo"]},

    {"q": "Can you book a demo tomorrow at 4 PM?",
     "sections": ["demo_and_buying_intent", "pricing_and_offer", "knowledge_boundaries"],
     "keywords": ["demo", "scheduling"]},

    {"q": "Can I get an annual discount?",
     "sections": ["pricing_and_offer", "objection_handling", "knowledge_boundaries"],
     "keywords": ["discount"]},

    {"q": "I need to discuss with my manager.",
     "sections": ["objection_handling"],
     "keywords": ["follow up", "two to three days"]},

    {"q": "Not interested.",
     "sections": ["objection_handling"],
     "keywords": ["Not interested"]},

    {"q": "What security certifications do you have?",
     "sections": ["knowledge_boundaries"],
     "keywords": ["Security certifications"]},

    # ---- Extra: unsupported-feature questions (should hit knowledge_boundaries) ----
    {"q": "Do you have a mobile app?",
     "sections": ["knowledge_boundaries"], "keywords": ["mobile apps"]},
    {"q": "Is there an API available?",
     "sections": ["knowledge_boundaries"], "keywords": ["API"]},
    {"q": "Can I import my leads from Excel?",
     "sections": ["knowledge_boundaries"], "keywords": ["import"]},
    {"q": "What is your refund and cancellation policy?",
     "sections": ["knowledge_boundaries"], "keywords": ["Refunds", "cancellation"]},
    {"q": "Can I send WhatsApp templates in bulk?",
     "sections": ["knowledge_boundaries", "features_and_value"], "keywords": ["WhatsApp"]},
    {"q": "Are taxes included in the price?",
     "sections": ["pricing_and_offer", "knowledge_boundaries"], "keywords": ["Taxes"]},
    {"q": "What other plans do you have?",
     "sections": ["pricing_and_offer"], "keywords": ["Other plans", "Not specified"]},

    # ---- Extra: objections, intent, discovery ----
    {"q": "It's too expensive for us.",
     "sections": ["objection_handling"], "keywords": ["expensive", "799"]},
    {"q": "I want to get started, what's next?",
     "sections": ["demo_and_buying_intent"], "keywords": ["buying signals", "demo"]},
    {"q": "Who is this best suited for?",
     "sections": ["customer_fit_and_discovery", "product_overview"], "keywords": ["10", "20"]},
    {"q": "Reminders kaise kaam karte hain?",
     "sections": ["features_and_value"], "keywords": ["reminders"]},
    {"q": "Can you mark me as converted if I ask about pricing?",
     "sections": ["demo_and_buying_intent"], "keywords": ["Converted"]},
]

hits = sec_hits = kw_hits = 0
for case in TEST_CASES:
    top = rerank(case["q"], retrieve(case["q"]))
    text = " ".join(c["text"] for c in top).lower()

    sec_ok = any(c["metadata"]["section"] in case["sections"] for c in top)
    kw_ok = all(k.lower() in text for k in case["keywords"]) 

    sec_hits += sec_ok
    kw_hits += kw_ok
    hits += sec_ok and kw_ok
    print(f"{'✓' if sec_ok and kw_ok else '✗'}  {case['q']}  "
          f"[section={'ok' if sec_ok else 'MISS'}, keywords={'ok' if kw_ok else 'MISS'}]")

n = len(TEST_CASES)
print(f"\nSection hit: {sec_hits}/{n} | Keyword hit: {kw_hits}/{n} | Both: {hits}/{n}")