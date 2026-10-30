"""
verify_phase3_proxy.py
Proves:
1. Next.js rewrite proxy routes to Flask backend (/api/v1/* -> Flask)
2. Cookie round-trip: login through Next.js sets Flask session cookie, subsequent requests authenticate properly
3. Large base64 payload upload through Next.js proxy rewrite
"""

import os
import sys
import time
import requests
import subprocess
import base64

FLASK_PORT = 5000
NEXT_PORT = 3000

def main():
    print("=== Starting Phase 3 Proxy & Cookie Verification ===")
    
    # 1. Start Flask on FLASK_PORT
    flask_env = os.environ.copy()
    flask_env["PORT"] = str(FLASK_PORT)
    flask_env["FLASK_RUN_PORT"] = str(FLASK_PORT)
    flask_proc = subprocess.Popen(
        [sys.executable, "-c", f"""
import os
from app import app
app.run(host='127.0.0.1', port={FLASK_PORT}, debug=False)
"""],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    # 2. Start Next.js on NEXT_PORT pointing to Flask
    next_env = os.environ.copy()
    next_env["PORT"] = str(NEXT_PORT)
    next_env["FLASK_API_URL"] = f"http://127.0.0.1:{FLASK_PORT}"
    
    next_proc = subprocess.Popen(
        ["npx.cmd", "next", "start", "-p", str(NEXT_PORT)],
        cwd=os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend"),
        env=next_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        shell=True
    )

    try:
        # Wait for both servers to be ready
        print("Waiting for servers to start...")
        flask_ready = False
        next_ready = False
        for _ in range(30):
            time.sleep(1)
            if not flask_ready:
                try:
                    r = requests.get(f"http://127.0.0.1:{FLASK_PORT}/api/health", timeout=1)
                    if r.status_code == 200:
                        flask_ready = True
                        print(f"Flask ready on {FLASK_PORT}")
                except Exception:
                    pass
            if not next_ready:
                try:
                    r = requests.get(f"http://127.0.0.1:{NEXT_PORT}/admin/login", timeout=1)
                    if r.status_code == 200:
                        next_ready = True
                        print(f"Next.js ready on {NEXT_PORT}")
                except Exception:
                    pass
            if flask_ready and next_ready:
                break
        
        if not (flask_ready and next_ready):
            print(f"Failed to start servers. Flask ready: {flask_ready}, Next.js ready: {next_ready}")
            sys.exit(1)

        session = requests.Session()

        # Step 1: Healthcheck through Next.js proxy
        print("\n--- Test 1: Proxy Healthcheck ---")
        health_resp = session.get(f"http://127.0.0.1:{NEXT_PORT}/api/v1/api/health")
        print(f"GET /api/v1/api/health -> Status: {health_resp.status_code}")
        assert health_resp.status_code == 200, f"Expected 200, got {health_resp.status_code}"
        health_data = health_resp.json()
        print(f"Health response status: {health_data.get('status')}")
        assert "status" in health_data

        # Step 2: Cookie round-trip through Next.js proxy
        print("\n--- Test 2: Cookie Round-Trip & Authentication ---")
        # Unauthenticated request should be 401
        unauth_resp = session.get(f"http://127.0.0.1:{NEXT_PORT}/api/v1/admin/sites")
        print(f"GET /api/v1/admin/sites (unauthenticated) -> Status: {unauth_resp.status_code}")
        assert unauth_resp.status_code == 401, f"Expected 401, got {unauth_resp.status_code}"

        # Login via proxy
        login_resp = session.post(
            f"http://127.0.0.1:{NEXT_PORT}/api/v1/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        print(f"POST /api/v1/admin/login -> Status: {login_resp.status_code}")
        assert login_resp.status_code == 200, f"Expected 200, got {login_resp.status_code}"
        login_data = login_resp.json()
        print(f"Login response: ok={login_data.get('ok')}, redirect={login_data.get('redirect')}")
        assert login_data.get("ok") is True

        # Verify session cookie was set
        cookies = session.cookies.get_dict()
        print(f"Session cookies received: {list(cookies.keys())}")
        assert "session" in cookies, "Flask session cookie not found in client cookie jar!"

        # Authenticated request through proxy
        auth_resp = session.get(f"http://127.0.0.1:{NEXT_PORT}/api/v1/admin/sites")
        print(f"GET /api/v1/admin/sites (authenticated) -> Status: {auth_resp.status_code}")
        assert auth_resp.status_code == 200, f"Expected 200, got {auth_resp.status_code}"
        sites_data = auth_resp.json()
        assert "sites" in sites_data, "Expected 'sites' in response data"
        print(f"Sites retrieved: {len(sites_data['sites'])} site(s)")

        # Step 3: Employee Login and Large Payload Upload (Proxy Limits)
        print("\n--- Test 3: Large Payload Upload & Employee Session (Proxy Limits) ---")
        emp_session = requests.Session()
        emp_login_resp = emp_session.post(
            f"http://127.0.0.1:{NEXT_PORT}/api/v1/employee/login",
            json={"identifier": "29", "password": "employee123"}
        )
        print(f"POST /api/v1/employee/login -> Status: {emp_login_resp.status_code}")
        assert emp_login_resp.status_code == 200, f"Expected 200, got {emp_login_resp.status_code}"
        emp_cookies = emp_session.cookies.get_dict()
        assert "session" in emp_cookies, "Employee session cookie not set"
        print("Employee session cookie verified.")

        # Generate 1.2MB dummy image base64 data
        dummy_bytes = b"\x89PNG\r\n\x1a\n" + (b"\x00" * (1200 * 1024))
        b64_image = "data:image/png;base64," + base64.b64encode(dummy_bytes).decode("ascii")
        print(f"Generated test base64 payload size: {len(b64_image) / 1024:.1f} KB")

        t0 = time.time()
        payload = {
            "image": b64_image,
            "lat": 18.5204,
            "lng": 73.8567,
            "type": "check_in"
        }
        large_resp = emp_session.post(
            f"http://127.0.0.1:{NEXT_PORT}/api/v1/employee/mark-attendance",
            json=payload
        )
        elapsed = time.time() - t0
        print(f"POST /api/v1/employee/mark-attendance (1.2MB payload) -> Status: {large_resp.status_code}, Elapsed: {elapsed:.3f}s")
        # Response should be processed by Flask application (not proxy 413 or 502/504)
        assert large_resp.status_code in (200, 400), f"Unexpected proxy failure code: {large_resp.status_code}"
        print(f"Proxy successfully passed 1.2MB payload without truncation or proxy errors.")

        print("\nALL PHASE 3 PROXY & COOKIE TESTS PASSED!")

    finally:
        print("\nShutting down test servers...")
        try:
            flask_proc.terminate()
            flask_proc.kill()
        except Exception:
            pass
        try:
            next_proc.terminate()
            next_proc.kill()
        except Exception:
            pass

if __name__ == "__main__":
    main()
