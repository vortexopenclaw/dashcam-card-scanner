// SPDX-License-Identifier: AGPL-3.0-only
//! Read-only, bounded structured device-info observations. No decoder or raw-log export.
use cap_fs_ext::{DirExt, FollowSymlinks, OpenOptionsFollowExt, OpenOptionsSyncExt};
use cap_std::fs::{Dir, OpenOptions};
use serde::{
    de::{self, MapAccess, SeqAccess, Visitor},
    Deserialize, Deserializer, Serialize,
};
use serde_json::{json, Value};
use std::{
    collections::BTreeSet,
    fmt,
    io::Read,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        LazyLock,
    },
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ComponentMetadata {
    pub manufacturer: String,
    pub component: String,
    pub reported_model: Option<String>,
    pub model: Option<String>,
    pub firmware_version: Option<String>,
    pub source_kind: String,
    pub source_file: String,
    pub source_line: usize,
    pub identity_established: bool,
}
#[derive(Clone, Default, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Coverage {
    pub inspected_files: usize,
    pub retained_entries: usize,
    pub omitted_entries: usize,
    pub limited: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Identity {
    id: String,
    model: String,
    region: String,
    aliases: Vec<String>,
    recognition_eligible: bool,
}
static IDENTITIES: LazyLock<Vec<Identity>> = LazyLock::new(|| {
    let v: Value = serde_json::from_str(include_str!("../../src/ddpai-identities.json"))
        .expect("DDPAI identities");
    serde_json::from_value(v["identities"].clone()).expect("DDPAI identities")
});
// Anchored retail/manual strings only. Never remove punctuation or guess SKU wrappers.
fn token(s: &str) -> String {
    let lower = s.to_lowercase();
    let value = lower.strip_prefix("ddpai ").unwrap_or(&lower);
    if value == "dz2602_global_z100 master" {
        "z100 master".to_owned()
    } else {
        value.to_owned()
    }
}
fn candidates(s: &str) -> Vec<&'static Identity> {
    // The exact observed product SKU establishes MINI3X, not a hardware revision.
    static MINI3X: LazyLock<Identity> = LazyLock::new(|| Identity {
        id: "ddpai-mini3x".into(),
        model: "MINI3X".into(),
        region: "Overseas".into(),
        aliases: vec![],
        recognition_eligible: true,
    });
    if s == "DDPAI DM003_Overseas_V2" {
        return vec![&MINI3X];
    }
    let t = token(s);
    IDENTITIES
        .iter()
        .filter(|c| {
            c.recognition_eligible
                && std::iter::once(&c.model)
                    .chain(&c.aliases)
                    .any(|n| token(n) == t)
        })
        .collect()
}
fn exact_model(s: &str) -> Option<String> {
    if s == "DDPAI DM003_Overseas_V2" {
        return Some("MINI3X".into());
    }
    let c = candidates(s);
    if c.len() != 1 {
        return None;
    }
    std::iter::once(&c[0].model)
        .chain(&c[0].aliases)
        .find(|name| token(name) == token(s))
        .map(|name| name.strip_prefix("DDPAI ").unwrap_or(name).to_owned())
}
fn safe_model(s: &str) -> bool {
    !s.is_empty()
        && s.trim() == s
        && s.chars().count() <= 80
        && s.len() <= 240
        && s.chars()
            .all(|c| c.is_alphanumeric() || " ._()-+".contains(c))
}
fn firmware(s: &str) -> bool {
    static RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"^[vV]?[0-9]{1,4}(?:\.[0-9]{1,6}){1,5}(?:[_+-][A-Za-z0-9.-]{1,32})?$")
            .unwrap()
    });
    s.len() <= 64 && RE.is_match(s)
}
fn filename(s: &str) -> bool {
    static RE: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new(r"^ui_[0-9]{14}_[0-9]{3}\.log$").unwrap());
    RE.is_match(s)
}
// Recursive duplicate rejection, including unknown nested fields. JSON Value alone
// would silently keep the last key, allowing a hidden identity conflict.
pub(crate) struct Unique(pub(crate) Value);
impl<'de> Deserialize<'de> for Unique {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct V;
        impl<'de> Visitor<'de> for V {
            type Value = Unique;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("unique-key JSON")
            }
            fn visit_map<M: MapAccess<'de>>(self, mut m: M) -> Result<Unique, M::Error> {
                let mut out = serde_json::Map::new();
                while let Some(k) = m.next_key::<String>()? {
                    if out.contains_key(&k) {
                        return Err(de::Error::custom("duplicate key"));
                    }
                    out.insert(k, m.next_value::<Unique>()?.0);
                }
                Ok(Unique(Value::Object(out)))
            }
            fn visit_seq<S: SeqAccess<'de>>(self, mut s: S) -> Result<Unique, S::Error> {
                let mut v = Vec::new();
                while let Some(x) = s.next_element::<Unique>()? {
                    v.push(x.0);
                }
                Ok(Unique(Value::Array(v)))
            }
            fn visit_str<E: de::Error>(self, s: &str) -> Result<Unique, E> {
                Ok(Unique(json!(s)))
            }
            fn visit_bool<E: de::Error>(self, b: bool) -> Result<Unique, E> {
                Ok(Unique(json!(b)))
            }
            fn visit_i64<E: de::Error>(self, n: i64) -> Result<Unique, E> {
                Ok(Unique(json!(n)))
            }
            fn visit_u64<E: de::Error>(self, n: u64) -> Result<Unique, E> {
                Ok(Unique(json!(n)))
            }
            fn visit_f64<E: de::Error>(self, n: f64) -> Result<Unique, E> {
                Ok(Unique(json!(n)))
            }
            fn visit_unit<E: de::Error>(self) -> Result<Unique, E> {
                Ok(Unique(Value::Null))
            }
        }
        d.deserialize_any(V)
    }
}
// Only CSI SGR (digits/semicolons followed by m) is logger framing.
// Never apply this to JSON: controls in payloads must retain their meaning/fail.
fn sgr_len(bytes: &[u8]) -> Option<usize> {
    if !bytes.starts_with(b"\x1b[") {
        return None;
    }
    let end = bytes[2..]
        .iter()
        .position(|b| !b.is_ascii_digit() && *b != b';')?
        + 2;
    (bytes[end] == b'm').then_some(end + 1)
}
fn safe_framing(text: &str) -> bool {
    let mut bytes = text.as_bytes();
    while !bytes.is_empty() {
        if bytes[0] == 0x1b {
            let Some(n) = sgr_len(bytes) else {
                return false;
            };
            bytes = &bytes[n..];
        } else {
            bytes = &bytes[1..];
        }
    }
    !text
        .chars()
        .any(|c| c.is_control() && c != '\t' && c != '\x1b')
}
pub(crate) fn payload(line: &str) -> Option<&str> {
    let (start, _) = line
        .match_indices('{')
        .find(|(i, _)| line[i + 1..].trim_start().starts_with('"'))?;
    let mut enclosing_arrays = 0usize;
    let mut prefix = &line.as_bytes()[..start];
    while let Some((&b, rest)) = prefix.split_first() {
        if b == 0x1b {
            prefix = &prefix[sgr_len(prefix)?..];
            continue;
        }
        prefix = rest;
        if b == b'[' {
            enclosing_arrays += 1;
        } else if b == b']' {
            enclosing_arrays = enclosing_arrays.saturating_sub(1);
        }
    }
    if enclosing_arrays > 0 {
        return None;
    }
    let mut depth = 0usize;
    let mut quoted = false;
    let mut escaped = false;
    for (i, b) in line.as_bytes()[start..].iter().copied().enumerate() {
        if quoted {
            if escaped {
                escaped = false;
            } else if b == b'\\' {
                escaped = true;
            } else if b == b'"' {
                quoted = false;
            }
        } else if b == b'"' {
            quoted = true;
        } else if b == b'{' || b == b'[' {
            depth += 1;
        } else if b == b'}' || b == b']' {
            depth = depth.checked_sub(1)?;
            if depth == 0 {
                if !safe_framing(&line[..start]) || !safe_framing(&line[start + i + 1..]) {
                    return None;
                }
                return Some(&line[start..start + i + 1]);
            }
        }
    }
    None
}
fn record(line: &str, source: &str, number: usize) -> Result<Vec<ComponentMetadata>, ()> {
    let product = source
        .strip_prefix("DCIM/207log/")
        .is_some_and(|n| filename(&format!("ui_{n}")));
    if product && !line.contains("WEBGetProductInfo[") {
        return Ok(vec![]);
    }
    let Some(json) = payload(line) else {
        return if (product && line.contains("pJsonData")) || !safe_framing(line)
            || (line.contains("\"model\"") && line.contains("\"soft_version\""))
        {
            Err(())
        } else {
            Ok(vec![])
        };
    };
    let v = serde_json::from_str::<Unique>(json).map_err(|_| ())?.0;
    if source
        .strip_prefix("DCIM/207log/")
        .is_some_and(|n| filename(&format!("ui_{n}")))
    {
        static PRODUCT: LazyLock<regex::Regex> = LazyLock::new(|| {
            regex::Regex::new(r"WEBGetProductInfo\[[0-9]+\]:pJsonData=$").unwrap()
        });
        if !PRODUCT.is_match(line.split_once('{').map(|x| x.0).unwrap_or("")) {
            return Ok(vec![]);
        }
        let model = v
            .get("model")
            .and_then(Value::as_str)
            .filter(|s| safe_model(s))
            .ok_or(())?;
        let version = v
            .get("version")
            .and_then(Value::as_str)
            .filter(|s| firmware(s))
            .ok_or(())?;
        return Ok(vec![ComponentMetadata {
            manufacturer: "DDPAI".into(),
            component: "logging_device".into(),
            reported_model: Some(model.into()),
            model: exact_model(model),
            firmware_version: Some(version.into()),
            source_kind: "ddpai_product_info".into(),
            source_file: source.into(),
            source_line: number,
            identity_established: exact_model(model).is_some(),
        }]);
    }
    if !v.get("msgHdr").is_some_and(Value::is_object)
        || v.get("model").is_none()
        || v.get("soft_version").is_none()
    {
        return Ok(vec![]);
    }
    let mut rows = Vec::new();
    for (component, mk, fk) in [
        ("logging_device", "model", "soft_version"),
        ("rear", "rear_model", "rear_version"),
        ("inside", "inside_model", "inside_version"),
    ] {
        if v.get(mk).is_none() && v.get(fk).is_none() {
            continue;
        }
        let model = match v.get(mk) {
            None => None,
            Some(Value::String(s)) if s.is_empty() => None,
            Some(Value::String(s)) if safe_model(s) => Some(s.clone()),
            _ => return Err(()),
        };
        let version = match v.get(fk) {
            None => None,
            Some(Value::String(s)) if s.is_empty() => None,
            Some(Value::String(s)) if firmware(s) => Some(s.clone()),
            _ => return Err(()),
        };
        if model.is_none() && version.is_none() {
            continue;
        }
        rows.push(ComponentMetadata {
            manufacturer: "DDPAI".into(),
            component: component.into(),
            model: model.as_deref().and_then(exact_model),
            identity_established: model.as_deref().and_then(exact_model).is_some(),
            reported_model: model,
            firmware_version: version,
            source_kind: "ddpai_ui_device_info".into(),
            source_file: source.into(),
            source_line: number,
        });
    }
    Ok(rows)
}
fn child(dir: &Dir, name: &str) -> std::io::Result<Dir> {
    let m = dir.symlink_metadata(name)?;
    if !m.is_dir() || m.file_type().is_symlink() || reparse(&m) {
        return Err(std::io::Error::other("unsafe directory"));
    }
    dir.open_dir_nofollow(name)
}
fn reparse(m: &cap_std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use cap_std::fs::MetadataExt;
        m.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        let _ = m;
        false
    }
}
pub fn read(root: &Path, cancel: &AtomicBool) -> (Vec<ComponentMetadata>, Option<Coverage>) {
    let (mut rows, a) = read_directory(root, cancel, false);
    let (extra, b) = read_directory(root, cancel, true);
    if a.is_none() && b.is_none() {
        return (rows, None);
    }
    let mut c = a.unwrap_or_default();
    let b = b.unwrap_or_default();
    c.inspected_files += b.inspected_files;
    c.limited |= b.limited;
    c.omitted_entries += b.omitted_entries;
    for row in extra {
        if rows.len() < 32 {
            rows.push(row);
        } else {
            c.omitted_entries += 1;
            c.limited = true;
        }
    }
    c.retained_entries = rows.len();
    (rows, Some(c))
}
fn read_directory(
    root: &Path,
    cancel: &AtomicBool,
    product: bool,
) -> (Vec<ComponentMetadata>, Option<Coverage>) {
    let mut rows = Vec::new();
    let mut c = Coverage::default();
    let Ok(mut dir) = crate::engine::open_dir_secure(root) else {
        c.limited = true;
        return (rows, Some(c));
    };
    for name in if product {
        &["DCIM", "207log"][..]
    } else {
        &["DCIM", "207log", "ui"][..]
    } {
        match child(&dir, name) {
            Ok(next) => dir = next,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return (rows, None),
            Err(_) => {
                c.limited = true;
                return (rows, Some(c));
            }
        }
    }
    let Ok(entries) = dir.entries() else {
        c.limited = true;
        return (rows, Some(c));
    };
    let mut names = Vec::new();
    for (i, entry) in entries.enumerate() {
        if i >= 512 {
            c.limited = true;
            break;
        }
        match entry {
            Ok(e) => {
                if let Some(n) = e.file_name().to_str().filter(|n| {
                    if product {
                        filename(&format!("ui_{n}"))
                    } else {
                        filename(n)
                    }
                }) {
                    names.push(n.to_owned());
                }
            }
            Err(_) => c.limited = true,
        }
    }
    names.sort();
    if names.len() > 32 {
        names.truncate(32);
        c.limited = true;
    }
    let mut budget = 4 * 1024 * 1024usize;
    for name in names {
        if cancel.load(Ordering::Relaxed) || budget == 0 {
            c.limited = true;
            break;
        }
        let mut opts = OpenOptions::new();
        opts.read(true).follow(FollowSymlinks::No).nonblock(true);
        let m = match dir.symlink_metadata(&name) {
            Ok(m) if m.is_file() && !m.file_type().is_symlink() && !reparse(&m) => m,
            _ => {
                c.limited = true;
                continue;
            }
        };
        let mut f = match dir.open_with(&name, &opts) {
            Ok(f) if f.metadata().is_ok_and(|m| m.is_file() && !reparse(&m)) => f,
            _ => {
                c.limited = true;
                continue;
            }
        };
        let limit = budget.min(512 * 1024);
        let mut bytes = Vec::new();
        c.inspected_files += 1;
        if (&mut f)
            .take(limit as u64 + 1)
            .read_to_end(&mut bytes)
            .is_err()
        {
            c.limited = true;
            continue;
        }
        budget = budget.saturating_sub(bytes.len());
        if !f
            .metadata()
            .is_ok_and(|after| after.len() == m.len() && after.modified().ok() == m.modified().ok())
        {
            c.limited = true;
            continue;
        }
        if bytes.len() > limit || m.len() > limit as u64 {
            c.limited = true;
            bytes.truncate(limit);
            if let Some(last) = bytes.iter().rposition(|b| *b == b'\n') {
                bytes.truncate(last + 1);
            } else {
                continue;
            }
        }
        if product {
            // Fixed-size logger buffers may end with NUL padding only. Embedded
            // NUL followed by nonzero bytes is corruption, not a line separator.
            if let Some(end) = bytes.iter().position(|b| *b == 0) {
                // This logger reserves its final eight bytes as an opaque trailer.
                // Never decode it. All intervening fixed-buffer padding must be zero.
                let padding_end = if bytes.len() == 512000 { bytes.len() - 8 } else { bytes.len() };
                if end > padding_end || bytes[end..padding_end].iter().any(|b| *b != 0) {
                    c.limited = true;
                    continue;
                }
                bytes.truncate(end);
            }
        }
        let Ok(text) = std::str::from_utf8(&bytes) else {
            c.limited = true;
            continue;
        };
        let source = if product {
            format!("DCIM/207log/{name}")
        } else {
            format!("DCIM/207log/ui/{name}")
        };
        for (i, line) in text.lines().enumerate() {
            if cancel.load(Ordering::Relaxed) {
                c.limited = true;
                break;
            }
            if line.len() > 16384
                || line
                    .chars()
                    .any(|x| x.is_control() && x != '\t' && x != '\x1b')
            {
                c.limited = true;
                continue;
            }
            match record(line, &source, i + 1) {
                Ok(entries) => {
                    for entry in entries {
                        if rows.len() < 32 {
                            rows.push(entry);
                        } else {
                            c.omitted_entries += 1;
                            c.limited = true;
                        }
                    }
                }
                Err(()) => c.limited = true,
            }
        }
    }
    c.retained_entries = rows.len();
    (rows, Some(c))
}
/// Main protocol identity only. Accessories never establish the logging device.
/// Incomplete reads, unknown/sibling/mixed observations veto automatic identity.
pub fn recognition(r: &crate::engine::Report) -> Option<Value> {
    let coverage = r.component_metadata_coverage.as_ref()?;
    let main: Vec<_> = r
        .component_metadata
        .iter()
        .filter(|x| x.component == "logging_device")
        .collect();
    if main.is_empty() && !coverage.limited {
        return None;
    }
    let all: BTreeSet<_> = main
        .iter()
        .filter_map(|x| x.reported_model.as_deref())
        .collect();
    let matches: Vec<_> = all.iter().flat_map(|x| candidates(x)).collect();
    let candidate_rows: Vec<_> = matches
        .iter()
        .map(|x| json!({"id":x.id,"manufacturer":"DDPAI","model":x.model,"region":x.region}))
        .collect();
    if !coverage.limited
        && all.len() == 1
        && main.iter().all(|x| x.reported_model.is_some())
        && matches.len() == 1
    {
        let c = matches[0];
        return Some(
            json!({"manufacturer":"DDPAI","model":c.model,"confidence":"supported","reason":"Structured camera-log identity observation; editable, historical metadata, not live device authentication."}),
        );
    }
    Some(
        json!({"manufacturer":"DDPAI","confidence":"unknown","candidates":candidate_rows,"reason":"Unknown, ambiguous, mixed or incomplete structured-log identities. Confirm the camera; firmware observations are historical."}),
    )
}
pub fn confirmed_z100_main(r: &crate::engine::Report) -> bool {
    recognition(r).is_some_and(|v| v["model"] == "Z100 Master")
        && r.folders.iter().any(|f| {
            f.path.eq_ignore_ascii_case("DCIM/200video/front")
                && f.samples.iter().any(|s| s.video.is_some())
        })
}
#[cfg(test)]
#[path = "ddpai_log_tests.rs"]
mod tests;
#[cfg(test)]
#[path = "mini3x_tests.rs"]
mod mini3x_tests;
