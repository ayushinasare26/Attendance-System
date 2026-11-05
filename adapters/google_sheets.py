
import requests
from config import Config


def send_to_google_sheets(attendance_data):
    """
    Sends employee IN/OUT attendance to Google Sheets.
    """

    script_url = Config.GOOGLE_SHEETS_SCRIPT_URL

    if not script_url:
        print("Google Sheets URL is not configured.")
        return False

    try:
        response = requests.post(
            script_url,
            json=attendance_data,
            timeout=20
        )

        response.raise_for_status()

        result = response.json()

        if result.get("success") is not True:
            print("Google Sheets rejected the record:", result)
            return False

        print("Google Sheets sync successful:", result)
        return True

    except (requests.RequestException, ValueError) as e:
        print("Google Sheets sync failed:", e)
        return False
