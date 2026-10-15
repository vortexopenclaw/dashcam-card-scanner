// SPDX-License-Identifier: AGPL-3.0-only
//! Bounded ISO BMFF metadata reader. Never decodes media, reads tags or calls ffprobe.
use serde::{Deserialize, Serialize};
use std::io::{Read, Seek, SeekFrom};
const MAX_MOOV: usize = 4 * 1024 * 1024;
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Video {
    pub file_size_bytes: u64,
    pub duration_seconds: f64,
    pub codec: String,
    pub width: u32,
    pub height: u32,
    pub nominal_frame_rate: Option<f64>,
    pub video_bitrate: Option<f64>,
}
fn u32be(b: &[u8], n: usize) -> Option<u32> {
    Some(u32::from_be_bytes(b.get(n..n + 4)?.try_into().ok()?))
}
fn u64be(b: &[u8], n: usize) -> Option<u64> {
    Some(u64::from_be_bytes(b.get(n..n + 8)?.try_into().ok()?))
}
fn boxes(b: &[u8]) -> Option<Vec<([u8; 4], &[u8])>> {
    let mut result = Vec::new();
    let mut pos = 0;
    while pos < b.len() {
        if result.len() >= 4096 {
            return None;
        }
        let size = u32be(b, pos)? as usize;
        let kind = b.get(pos + 4..pos + 8)?.try_into().ok()?;
        let (size, header) = if size == 1 {
            (usize::try_from(u64be(b, pos + 8)?).ok()?, 16)
        } else if size == 0 {
            (b.len() - pos, 8)
        } else {
            (size, 8)
        };
        if size < header || size > b.len() - pos {
            return None;
        }
        result.push((kind, &b[pos + header..pos + size]));
        pos += size;
    }
    Some(result)
}
fn child<'a>(b: &'a [u8], tag: &[u8; 4]) -> Option<&'a [u8]> {
    boxes(b)?
        .into_iter()
        .find(|(k, _)| k == tag)
        .map(|(_, v)| v)
}
pub fn probe<R: Read + Seek>(f: &mut R, file_size: u64) -> Option<Video> {
    let mut pos = 0u64;
    let mut video = None;
    for _ in 0..256 {
        if pos == file_size {
            return video;
        }
        if file_size.saturating_sub(pos) < 8 {
            return None;
        }
        f.seek(SeekFrom::Start(pos)).ok()?;
        let mut h = [0; 16];
        f.read_exact(&mut h[..8]).ok()?;
        let size = u32be(&h, 0)? as u64;
        let (size, header) = if size == 1 {
            f.read_exact(&mut h[8..]).ok()?;
            (u64be(&h, 8)?, 16)
        } else if size == 0 {
            (file_size - pos, 8)
        } else {
            (size, 8)
        };
        if size < header || size > file_size - pos {
            return None;
        }
        // A moov may describe only the initial segment. Never pair that duration
        // or sample bitrate with the whole fragmented file's size.
        if &h[4..8] == b"moof" {
            return None;
        }
        if &h[4..8] == b"moov" {
            if video.is_some() {
                return None;
            }
            let n = usize::try_from(size - header).ok()?;
            if n > MAX_MOOV {
                return None;
            }
            let mut data = vec![0; n];
            f.read_exact(&mut data).ok()?;
            video = Some(parse_moov(&data, file_size)?);
        }
        pos += size;
    }
    None
}
fn parse_moov(data: &[u8], file_size: u64) -> Option<Video> {
    let children = boxes(data)?;
    if children.iter().any(|(tag, _)| tag == b"mvex") {
        return None;
    }
    for (tag, trak) in children {
        if &tag != b"trak" {
            continue;
        }
        let mdia = match child(trak, b"mdia") {
            Some(v) => v,
            None => continue,
        };
        let hdlr = child(mdia, b"hdlr")?;
        if hdlr.get(8..12)? != b"vide" {
            continue;
        }
        let mdhd = child(mdia, b"mdhd")?;
        let (scale, duration) = match *mdhd.first()? {
            0 => (u32be(mdhd, 12)?, u32be(mdhd, 16)? as u64),
            1 => (u32be(mdhd, 20)?, u64be(mdhd, 24)?),
            _ => return None,
        };
        if scale == 0 {
            return None;
        }
        let seconds = duration as f64 / scale as f64;
        if !seconds.is_finite() || seconds <= 0. || seconds > 86400. {
            return None;
        }
        let stbl = child(child(mdia, b"minf")?, b"stbl")?;
        let stsd = child(stbl, b"stsd")?;
        if u32be(stsd, 4)? != 1 {
            return None;
        }
        let entries = boxes(stsd.get(8..)?)?;
        let (codec, entry) = entries.first()?;
        let codec = match codec {
            b"avc1" | b"avc3" => "h264",
            b"hvc1" | b"hev1" => "hevc",
            b"av01" => "av1",
            b"mp4v" => "mpeg4",
            b"vp09" => "vp9",
            _ => return None,
        };
        let width = u16::from_be_bytes(entry.get(24..26)?.try_into().ok()?) as u32;
        let height = u16::from_be_bytes(entry.get(26..28)?.try_into().ok()?) as u32;
        if !(16..=32768).contains(&width) || !(16..=32768).contains(&height) {
            return None;
        }
        let (mut fps, mut bitrate) = (None, None);
        if let Some(stsz) = child(stbl, b"stsz") {
            let fixed = u32be(stsz, 4)? as u64;
            let count = u32be(stsz, 8)? as usize;
            if count > 1_000_000 {
                return None;
            }
            let total = if fixed > 0 {
                fixed.checked_mul(count as u64)?
            } else {
                if count > stsz.len().saturating_sub(12) / 4 {
                    return None;
                }
                let mut total = 0u64;
                for i in 0..count {
                    total = total.checked_add(u32be(stsz, 12 + i * 4)? as u64)?;
                }
                total
            };
            if total > file_size {
                return None;
            }
            let rate = count as f64 / seconds;
            if (0.01..=1000.).contains(&rate) {
                fps = Some(rate);
            }
            let bits = total as f64 * 8. / seconds;
            if bits > 0. && bits <= 1e10 {
                bitrate = Some(bits);
            }
        }
        return Some(Video {
            file_size_bytes: file_size,
            duration_seconds: seconds,
            codec: codec.into(),
            width,
            height,
            nominal_frame_rate: fps,
            video_bitrate: bitrate,
        });
    }
    None
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_truncated_and_huge_boxes() {
        for bytes in [
            vec![],
            vec![0; 32],
            vec![255; 32],
            b"\0\0\0\x01moov\xff\xff\xff\xff\xff\xff\xff\xff".to_vec(),
        ] {
            assert!(probe(&mut std::io::Cursor::new(&bytes), bytes.len() as u64).is_none());
        }
    }
    #[test]
    fn bounded_malformed_fuzz() {
        let mut seed = 17u32;
        for n in 0..2048 {
            let mut b = vec![0; n];
            for v in &mut b {
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                *v = (seed >> 24) as u8;
            }
            assert!(probe(&mut std::io::Cursor::new(&b), b.len() as u64).is_none());
        }
    }
}
