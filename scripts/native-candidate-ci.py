"""CI-only exact draft native probes; no source app changes or trust overrides."""
import base64, hashlib, json, os, pathlib, platform, shutil, subprocess, sys, time, urllib.request, urllib.error
E = pathlib.Path('native-evidence').resolve(); E.mkdir(exist_ok=True)
D = pathlib.Path(os.environ['RUNNER_TEMP']) / 'exact-scanner'; D.mkdir(exist_ok=True)
R = {'source':'afc679f96bc5fedca522e7db5e5155a12e5d0537','runner':platform.platform(),'arch':platform.machine(),'assets':[], 'commands':[], 'update':'STRUCTURALLY BLOCKED: fixed production latest 0.1.7; no supported staging override', 'acceptance':'INCOMPLETE'}
def run(args, check=True):
    p = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
    R['commands'].append({'args':args,'exit':p.returncode,'output':p.stdout}); print(p.stdout, flush=True)
    if check and p.returncode: raise RuntimeError(f'command failed: {args[0]} exit {p.returncode}')
    return p

def api(path, binary=False):
    req=urllib.request.Request('https://api.github.com/repos/vortexopenclaw/dashcam-card-scanner/'+path, headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/octet-stream' if binary else 'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
    try:
        with urllib.request.urlopen(req, timeout=90) as f: b=f.read()
    except urllib.error.HTTPError as ex:
        # Response metadata only; never request Authorization or redirect URLs.
        detail={'path':path,'status':ex.code,'body':ex.read().decode('utf-8','replace'),'accepted_permissions':ex.headers.get('X-Accepted-GitHub-Permissions'),'request_id':ex.headers.get('X-GitHub-Request-Id')}
        R['api_denial']=detail
        print(json.dumps(detail),flush=True)
        raise
    return b if binary else json.loads(b)

def fetch(a):
    b=api('releases/assets/'+str(a['id']), True); h=hashlib.sha256(b).hexdigest()
    assert a['digest']=='sha256:'+h
    p=D/a['name']; p.write_bytes(b); R['assets'].append({'id':a['id'],'name':a['name'],'sha256':h}); return p

def verify(payload, sig, public):
    s=base64.b64decode(sig.read_bytes()).decode().splitlines(); k=base64.b64decode(public).decode().splitlines(); kb=base64.b64decode(k[1]); sb=base64.b64decode(s[1]); cb=base64.b64decode(s[3])
    assert sb[:2]==b'ED' and sb[2:10]==kb[2:10]
    inp={'key':base64.b64encode(bytes.fromhex('302a300506032b6570032100')+kb[10:]).decode(),'sig':base64.b64encode(sb[10:]).decode(),'digest':base64.b64encode(hashlib.blake2b(payload.read_bytes(),digest_size=64).digest()).decode(),'commentSig':base64.b64encode(cb).decode(),'commentData':base64.b64encode(sb[10:]+s[2].removeprefix('trusted comment: ').encode()).decode()}
    f=D/'verify.json'; f.write_text(json.dumps(inp))
    js="const c=require('crypto'),f=require('fs'),v=JSON.parse(f.readFileSync(process.argv[1]));const b=s=>Buffer.from(s,'base64'),k=c.createPublicKey({key:b(v.key),format:'der',type:'spki'});if(!c.verify(null,b(v.digest),k,b(v.sig))||!c.verify(null,b(v.commentData),k,b(v.commentSig)))process.exit(2);const t=b(v.digest);t[0]^=1;if(c.verify(null,t,k,b(v.sig)))process.exit(3);console.log('Pinned production ED signature + trusted comment PASS; tamper negative PASS');"
    run(['node','-e',js,str(f)]); R['signature']='PASS including trusted comment and tamper negative'

try:
    release=api('releases/419929169'); assert release['draft'] and release['target_commitish']==R['source']
    assets={a['name']:a for a in release['assets']}
    system=platform.system(); mac=system=='Darwin'
    stem='Dashcam-Card-Scanner-0.1.8-'
    suffix=('Mac-Apple-Silicon' if platform.machine()=='arm64' else 'Mac-Intel')+'-Update.app.tar.gz' if mac else ('Windows-x64.exe' if system=='Windows' else 'Linux-x64.AppImage')
    payload=fetch(assets[stem+suffix]); sig=fetch(assets[stem+suffix+'.sig'])
    public=json.loads(pathlib.Path('src-tauri/tauri.conf.json').read_text())['plugins']['updater']['pubkey']; verify(payload,sig,public)
    dmg=fetch(assets[stem+suffix.replace('-Update.app.tar.gz','.dmg')]) if mac else None
    # Never propagate the repository token into the candidate app.
    del os.environ['GITHUB_TOKEN']
    if mac:
        mount=D/'mount'; mount.mkdir()
        try:
            run(['hdiutil','attach','-readonly','-nobrowse','-noautoopen','-mountpoint',str(mount),str(dmg)])
            app=next(mount.glob('*.app')); installed=D/app.name
            run(['ditto',str(app),str(installed)])
            unpack=D/'updater'; unpack.mkdir(); run(['tar','-xzf',str(payload),'-C',str(unpack)])
            signedapp=next(unpack.glob('*.app'))
            def tree(root):
                return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}
            assert tree(installed)==tree(signedapp), 'DMG app differs from authenticated updater app'
            R['dmg_signed_payload_parity']='PASS exact file SHA256 tree'
            run(['codesign','--verify','--deep','--strict',str(installed)])
            run(['spctl','--assess','--type','execute','--verbose=4',str(installed)],False)
            run(['/usr/libexec/PlistBuddy','-c','Print :CFBundleShortVersionString',str(installed/'Contents/Info.plist')])
            for attempt in (1,2):
                run(['open',str(installed)])
                time.sleep(10)
                run(['swift','scripts/native-candidate-windows.swift',str(E/f'windows-{attempt}.json')])
                windows=json.loads((E/f'windows-{attempt}.json').read_text())
                scanner=[w for w in windows if w.get('kCGWindowOwnerName')=='Dashcam Card Scanner' and w.get('kCGWindowLayer')==0]
                assert scanner, 'LaunchServices returned but native Scanner window not confirmed'
                R.setdefault('native_windows',[]).append(scanner)
                run(['screencapture','-x',str(E/f'screen-{attempt}.png')],False)
                run(['osascript','-e',f'tell application "{installed}" to quit'])
                time.sleep(3)
            R['acceptance']='DMG install, signed app parity, native fresh/restart windows PASS; screenshot rendering requires review'
        finally:
            run(['hdiutil','detach',str(mount)],False)
    elif system=='Windows':
        script=pathlib.Path('scripts/native-candidate-windows.ps1').resolve()
        run(['powershell','-NoProfile','-File',str(script),str(payload),str(D),str(E)])
        R['acceptance']='See Windows evidence; UI verification required'
    else:
        payload.chmod(0o755)
        # Native FUSE AppImage only: no extract-and-run workaround for mount denial.
        script=pathlib.Path('scripts/native-candidate-linux.sh').resolve()
        run(['xvfb-run','-a','bash',str(script),str(payload),str(E)])
        R['acceptance']='Native window on fresh start and restart PASS; version from signed payload/source'
except Exception as ex:
    R['blocker']=str(ex); print('INCOMPLETE:',ex,flush=True)
finally:
    (E/'report.json').write_text(json.dumps(R,indent=2))
    shutil.rmtree(D)
    (E/'cleanup.txt').write_text('Disposable download/install staging removed; hosted runner is destroyed by GitHub. No owner host application launched.\n')
if 'blocker' in R: sys.exit(1)
