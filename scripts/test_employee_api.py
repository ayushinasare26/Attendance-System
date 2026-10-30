import requests
import subprocess
import time
import os
import sys

FLASK_PORT = 5000
NEXT_PORT = 3000

def test_employee_api():
    print("Testing Employee Endpoints...")
    s = requests.Session()
    
    # 1. Employee login
    r = s.post(f"http://127.0.0.1:{NEXT_PORT}/api/v1/employee/login", json={"identifier": "29", "password": "employee123"})
    print(f"Login status: {r.status_code}, json: {r.json()}")
    assert r.status_code == 200
    
    # 2. Get check-in-out context
    r = s.get(f"http://127.0.0.1:{NEXT_PORT}/api/v1/employee/check-in-out")
    print(f"Check-in-out context status: {r.status_code}")
    assert r.status_code == 200
    data = r.json()
    print("Keys in check-in-out:", list(data.keys()))
    assert "site" in data
    assert "shift" in data

    # 3. Get my-attendance context
    r = s.get(f"http://127.0.0.1:{NEXT_PORT}/api/v1/employee/my-attendance")
    print(f"My-attendance context status: {r.status_code}")
    assert r.status_code == 200
    att_data = r.json()
    print("Keys in my-attendance:", list(att_data.keys()))
    assert "records" in att_data

    # 4. Check whether next_action is check_out or check_in
    next_action = data.get("next_action", "check_in")
    print(f"Current next_action: {next_action}")
    
    if next_action == "check_out":
        r = s.post(f"http://127.0.0.1:{NEXT_PORT}/api/v1/employee/manual-check-out", json={
            "latitude": 18.5204,
            "longitude": 73.8567,
            "accuracy": 15.0,
            "is_demo": True,
            "bypass_cooldown": True
        })
        print(f"Manual check-out status: {r.status_code}, json: {r.json()}")
        assert r.status_code == 200
        assert r.json().get("success") is True

        # Now check-in
        r = s.post(f"http://127.0.0.1:{NEXT_PORT}/api/v1/employee/manual-check-in", json={
            "latitude": 18.5204,
            "longitude": 73.8567,
            "accuracy": 15.0,
            "is_demo": True,
            "bypass_cooldown": True
        })
        print(f"Manual check-in status: {r.status_code}, json: {r.json()}")
        assert r.status_code == 200
        assert r.json().get("success") is True
    else:
        r = s.post(f"http://127.0.0.1:{NEXT_PORT}/api/v1/employee/manual-check-in", json={
            "latitude": 18.5204,
            "longitude": 73.8567,
            "accuracy": 15.0,
            "is_demo": True,
            "bypass_cooldown": True
        })
        print(f"Manual check-in status: {r.status_code}, json: {r.json()}")
        assert r.status_code == 200
        assert r.json().get("success") is True

    # 6. Correction request
    r = s.post(f"http://127.0.0.1:{NEXT_PORT}/api/v1/employee/correction-request", json={
        "attendance_date": "2026-10-23",
        "reason": "Forgot to check out",
        "requested_change": "Please record check-out at 18:30"
    })
    print(f"Correction request status: {r.status_code}, json: {r.json()}")
    assert r.status_code == 200
    print("All employee API tests PASSED!")

if __name__ == "__main__":
    test_employee_api()
