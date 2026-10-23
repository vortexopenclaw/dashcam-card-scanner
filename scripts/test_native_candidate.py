"""Offline boundary regression tests; never execute a candidate or call GitHub."""
import ast
import hashlib
import pathlib
import tempfile
import unittest
import urllib.request

class BoundaryTests(unittest.TestCase):
    def setUp(self):
        source=pathlib.Path(__file__).with_name('native-candidate-ci.py').read_text()
        tree=ast.parse(source)
        declarations: list[ast.stmt]=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom,ast.FunctionDef,ast.ClassDef))]
        self.ns={}
        exec(compile(ast.Module(body=declarations,type_ignores=[]),'<probe>','exec'),self.ns)

    def test_redirect_removes_credential(self):
        req=urllib.request.Request('https://api.github.com/test',headers={'Authorization':'Bearer synthetic-not-a-secret','Accept':'application/octet-stream'})
        redirected=self.ns['PublicAssetRedirect']().redirect_request(req,None,302,'Found',{},'https://release-assets.githubusercontent.com/example')
        self.assertIsNone(redirected.get_header('Authorization'))
        with self.assertRaises(RuntimeError):
            self.ns['PublicAssetRedirect']().redirect_request(req,None,302,'Found',{},'http://example.com/')

    def test_offline_hash_and_tamper(self):
        with tempfile.TemporaryDirectory(dir=pathlib.Path.cwd()) as d:
            root=pathlib.Path(d); dest=root/'stage'; dest.mkdir()
            import os
            cwd=os.getcwd()
            try:
                os.chdir(root); bundle=root/'candidate-bundle'; bundle.mkdir()
                (bundle/'synthetic.bin').write_bytes(b'synthetic test fixture, not release data')
                asset={'id':1,'name':'synthetic.bin','size':len((bundle/'synthetic.bin').read_bytes()),'digest':'sha256:'+hashlib.sha256((bundle/'synthetic.bin').read_bytes()).hexdigest()}
                self.ns.update(BROKER=False,D=dest,R={'assets':[]})
                self.ns['api']=lambda *args: self.fail('Offline native path called network API')
                self.assertEqual(self.ns['fetch'](asset).read_bytes(),(bundle/'synthetic.bin').read_bytes())
                (bundle/'synthetic.bin').write_bytes(b'tampered')
                with self.assertRaises(AssertionError): self.ns['fetch'](asset)
            finally:
                os.chdir(cwd)

    def test_broker_only_get_api(self):
        source=pathlib.Path(__file__).with_name('native-candidate-ci.py').read_text()
        self.assertNotIn('method=',source)
        self.assertIn("if BROKER:",source)
        self.assertIn("assert {p.name for p in D.iterdir()}==set(assets)",source)
        self.assertIn("run(['spctl','--assess','--type','execute','--verbose=4',str(installed)],False)",source)

if __name__=='__main__': unittest.main()
