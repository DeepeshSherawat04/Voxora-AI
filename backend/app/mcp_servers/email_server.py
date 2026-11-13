"""MCP server: gives the sales agent real email-sending ability."""
import os, smtplib
from email.message import EmailMessage
from pathlib import Path
from dotenv import load_dotenv
from fastmcp import FastMCP

# backend/.env regardless of where the server is launched from
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

mcp = FastMCP("voxora-email")


def send_raw_email(to_email: str, subject: str, body: str) -> str:
    """
    Send one plain-text email via Gmail SMTP.
    This is the ONE place that touches credentials - both the MCP tools
    and the follow-up agent use it. Credentials are read from .env here
    and NEVER passed in, logged, or returned.
    """
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = os.environ["SENDER_EMAIL"]
    msg["To"] = to_email
    msg.set_content(body)
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(os.environ["SENDER_EMAIL"], os.environ["GMAIL_APP_PASSWORD"])
        server.send_message(msg)
    return f"Email successfully sent to {to_email}"   # no body, no credentials in the result


@mcp.tool()
def send_email(to_email: str, subject: str, body: str) -> str:
    """Send a plain-text email. Use for follow-up emails whose subject and
    body were drafted and approved. NEVER put passwords, API keys or
    credentials in the body - they must never leave the server."""
    return send_raw_email(to_email, subject, body)


@mcp.tool()
def send_demo_and_meeting_email(customer_email: str, customer_name: str) -> str:
    """Send the product demo link and meeting booking link to a customer
    who shared their email during the sales call. Call this ONLY after the
    customer explicitly provides their email address."""
    return send_raw_email(
        customer_email,
        "Your CloudDesk demo & meeting link",
        f"Hi {customer_name},\n\n"
        f"Thanks for your time on the call today! Here is what you asked for:\n\n"
        f"Product demo: {os.environ['DEMO_LINK']}\n"
        f"Book a meeting with our team: {os.environ['MEETING_LINK']}\n\n"
        f"Reply to this email anytime if you have questions.\n\n"
        f"Best regards,\nVeer - CloudDesk Sales",
    )


if __name__ == "__main__":
    mcp.run()