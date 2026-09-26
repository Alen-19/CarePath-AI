import os
import time
from playwright.sync_api import Page, expect

BASE_URL = "http://localhost:4200"
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")

def test_tc03_patient_slot_discovery_and_booking_flow(page: Page):
    """TC_03: Verify Patient Doctor Discovery, Calendar Slot Selection & Booking Summary using Playwright."""
    # 1. Login as Patient
    page.goto(f"{BASE_URL}/auth/login")
    page.wait_for_selector("#email")
    page.fill("#email", "justinsaji2412@gmail.com")
    page.fill("#password", "Justin@123")
    page.click("button[type='submit']")
    
    # 2. Wait for patient redirect
    page.wait_for_url("**/patient**", timeout=15000)
    assert "/patient" in page.url
    
    # 3. Locate verified doctor card & click 'Book Appointment'
    book_btn = page.locator(".btn-book").first
    expect(book_btn).to_be_visible(timeout=10000)
    book_btn.click()
    
    # 4. Assert Booking Modal Step 1 (Consultation Type) opened
    modal = page.locator(".booking-modal")
    expect(modal).to_be_visible(timeout=10000)
    expect(modal).to_contain_text("Book Appointment")
    
    # Step 1: Select Type & Advance
    page.click(".btn-next")
    page.wait_for_timeout(1000)
    
    # Step 2: Pick weekday date (Monday 2026-09-21) and dispatch change event to load slots
    page.wait_for_selector("#booking-date-input")
    page.evaluate("""
        () => {
            const input = document.getElementById('booking-date-input');
            input.value = '2026-09-21';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    """)
    page.wait_for_timeout(2000)
    
    # Wait for Next button to be enabled and advance to Step 3
    next_btn = page.locator("button.btn-next:not([disabled])")
    expect(next_btn).to_be_visible(timeout=10000)
    next_btn.click()
    page.wait_for_timeout(1000)
    
    # Step 3: Select Available Slot Pill
    slot_pill = page.locator(".slot-btn").first
    expect(slot_pill).to_be_visible(timeout=10000)
    slot_pill.click()
    page.wait_for_timeout(1000)
    
    # Advance to Step 4 (Booking Summary & Fee)
    next_btn = page.locator("button.btn-next:not([disabled])")
    next_btn.click()
    page.wait_for_timeout(1000)
    
    # Step 4: Verify Booking Summary & Fee
    summary_box = page.locator(".booking-summary-box")
    expect(summary_box).to_be_visible(timeout=10000)
    expect(summary_box).to_contain_text("Booking Summary")
    expect(summary_box).to_contain_text("Dr. Aibal Jacob")
    
    # Verify Pay button is visible and formatted
    pay_btn = page.locator(".btn-pay")
    expect(pay_btn).to_be_visible()
    expect(pay_btn).to_contain_text("Pay ₹")
    
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, "tc03_patient_booking_summary_checkout.png"))
    
    # Close modal
    page.click(".modal-close")

if __name__ == "__main__":
    import pytest
    import sys
    sys.exit(pytest.main([__file__, "-v"]))

