import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("refresh_receiver_comparison.py")
SPEC = importlib.util.spec_from_file_location("refresh_receiver_comparison", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class Response:
    def __enter__(self):
        return self

    def __exit__(self, _type, _value, _traceback):
        return False

    def read(self):
        return b"ok"


class UserAgentTests(unittest.TestCase):
    def test_workspace_version_drives_wspr_and_rbn_requests(self):
        with tempfile.TemporaryDirectory() as directory:
            repo_root = Path(directory)
            (repo_root / "Cargo.toml").write_text(
                '[workspace.package]\nversion = "9.8.7"\n',
                encoding="utf-8",
            )
            request_user_agent = MODULE.user_agent(repo_root)

        captured = []

        def open_request(request, timeout):
            captured.append((request, timeout))
            return Response()

        with patch.object(MODULE.urllib.request, "urlopen", open_request):
            MODULE.http_get(MODULE.WSPR_ENDPOINT, request_user_agent)
            MODULE.http_get(MODULE.RBN_ENDPOINT, request_user_agent)

        self.assertEqual(
            request_user_agent,
            "AntennaBench/9.8.7 (+https://antennabench.com)",
        )
        self.assertEqual(
            [request.get_header("User-agent") for request, _timeout in captured],
            [request_user_agent, request_user_agent],
        )


if __name__ == "__main__":
    unittest.main()
