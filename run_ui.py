#!/usr/bin/env python3
"""
Lightweight Web Server and CORS Proxy for Hunyuan3D Backend Tester.
Runs a local server to serve UI files and proxy requests to remote/local backends.
"""

import http.server
import socketserver
import urllib.request
import urllib.error
import json
import os
import sys
import webbrowser
import socket

# Configuration
DEFAULT_PORT = 8082
WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))

class TesterHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        """
        Map URLs to paths:
        - /assets/ -> <workspace>/assets/
        - Any other path -> <workspace>/test_ui/
        """
        # Strip query parameters/anchors
        clean_path = path.split('?')[0].split('#')[0]
        
        if clean_path.startswith('/assets/'):
            # Serve directly from the project's assets folder
            rel_path = clean_path.lstrip('/')
            return os.path.join(WORKSPACE_DIR, rel_path)
        else:
            # Serve from the test_ui subfolder
            rel_path = clean_path.lstrip('/')
            # Default to index.html for root path
            if not rel_path or rel_path == 'index.html':
                return os.path.join(WORKSPACE_DIR, 'test_ui', 'index.html')
            return os.path.join(WORKSPACE_DIR, 'test_ui', rel_path)

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def end_headers(self):
        """Add CORS header to regular static file responses."""
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_POST(self):
        """Handle POST requests, routing /proxy to the proxy handler."""
        if self.path == '/proxy':
            self.handle_proxy()
        else:
            super().do_POST()

    def handle_proxy(self):
        """
        CORS Proxy: Reads target details and forwards request using python's urllib.
        Accepts body: { url, method, headers, body }
        """
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            req_data = json.loads(post_data.decode('utf-8'))
            
            target_url = req_data.get('url')
            method = req_data.get('method', 'POST')
            headers = req_data.get('headers', {})
            body_str = req_data.get('body')
            
            if not target_url:
                self.send_error_response(400, "Missing target 'url' in proxy request payload.")
                return

            # Prepare urllib Request
            data_bytes = None
            if body_str:
                data_bytes = body_str.encode('utf-8')
                
            req = urllib.request.Request(target_url, data=data_bytes, method=method)
            
            # Forward headers to target
            for k, v in headers.items():
                req.add_header(k, v)
                
            # If Content-Type not present and body exists, set it
            if body_str and 'Content-Type' not in headers:
                req.add_header('Content-Type', 'application/json')
                
            # Execute request
            try:
                with urllib.request.urlopen(req, timeout=180) as resp:
                    resp_data = resp.read()
                    resp_headers = resp.info()
                    
                    self.send_response(resp.status)
                    
                    # Forward headers back to browser, filtering connection headers
                    excluded_headers = {'content-encoding', 'transfer-encoding', 'connection', 'keep-alive'}
                    for h_name, h_val in resp_headers.items():
                        if h_name.lower() not in excluded_headers:
                            self.send_header(h_name, h_val)
                            
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(resp_data)
                    
            except urllib.error.HTTPError as e:
                # Target returned HTTP error status (4xx/5xx)
                err_data = e.read()
                self.send_response(e.code)
                for h_name, h_val in e.headers.items():
                    if h_name.lower() not in {'connection', 'transfer-encoding'}:
                        self.send_header(h_name, h_val)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(err_data)
                
            except urllib.error.URLError as e:
                # Connection or DNS error
                self.send_error_response(502, f"Failed to connect to target backend: {e.reason}")
                
            except Exception as e:
                # General error
                self.send_error_response(500, f"Error forwarding request: {str(e)}")
                
        except Exception as e:
            self.send_error_response(400, f"Invalid proxy request: {str(e)}")

    def send_error_response(self, code, message):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode('utf-8'))

def is_port_available(port):
    """Check if a local port is free."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('127.0.0.1', port))
            return True
        except socket.error:
            return False

def main():
    # Allow port override from command line
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"Invalid port specified. Using default: {DEFAULT_PORT}")
            
    # Find next available port if default is taken
    while not is_port_available(port):
        print(f"Port {port} is currently in use. Trying next port...")
        port += 1
        
    server_address = ('127.0.0.1', port)
    
    # Enable socket re-use to prevent bind issues on restart
    socketserver.TCPServer.allow_reuse_address = True
    
    try:
        with socketserver.TCPServer(server_address, TesterHTTPRequestHandler) as httpd:
            url = f"http://localhost:{port}"
            print("\n" + "="*60)
            print(f"  Hunyuan3D Backend Tester is running!")
            print(f"  URL: {url}")
            print("="*60)
            print("  This server delivers the web interface and handles")
            print("  CORS-bypass proxying to keep your browser connections clean.")
            print("  Press Ctrl+C to terminate.")
            print("="*60 + "\n")
            
            # Automatically open browser
            try:
                webbrowser.open(url)
            except Exception:
                pass
                
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down tester web server. Goodbye!")
        sys.exit(0)

if __name__ == '__main__':
    main()
