const MAX_MESSAGE_LENGTH = 12000;
const MAX_CONTACT_LENGTH = 240;
const MAX_SAMPLE_PATHS = 80;
const MAX_FILENAME_PATTERN_SUMMARIES = 160;
const MAX_FILENAME_SEQUENCE_SUMMARIES = 240;
const MAX_DIRECTORY_SUMMARIES = 160;
const MAX_CLIP_GROUP_SUMMARIES = 160;
const MAX_VIDEO_SPEC_SAMPLES = 64;
const MAX_VIDEO_SPEC_SUMMARIES = 120;
const MAX_SETTING_SNAPSHOTS = 20;
const MAX_SETTING_VALUES = 40;
const MAX_TRAINING_FIELD_LENGTH = 1000;
const MAX_BODY_BYTES = 1024 * 1024;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const RATE_LIMIT_MAX_POSTS = 20;
const SECURITY_TXT = `Contact: mailto:security@vortexradar.com
Contact: https://www.vortexradar.com/security-contact/
Preferred-Languages: en
Canonical: https://www.vortexradar.com/.well-known/security.txt
Policy: https://www.vortexradar.com/security-contact/
Expires: 2027-06-17T23:59:59Z
`;

function securityTxtResponse(method) {
  return new Response(method === "HEAD" ? null : SECURITY_TXT, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
      "access-control-allow-origin": "*",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/.well-known/security.txt" && ["GET", "HEAD"].includes(request.method)) {
      return securityTxtResponse(request.method);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: responseHeaders(request, env) });
    }

    if (url.pathname !== "/feedback") {
      return json({ error: "not_found" }, 404, request, env);
    }

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, request, env);
    }

    const rateLimit = await checkRateLimit(request, env);
    if (!rateLimit.ok) {
      return json(
        { error: "rate_limited" },
        429,
        request,
        env,
        { "Retry-After": String(rateLimit.retryAfterSeconds) }
      );
    }

    const contentLength = Number(request.headers.get("Content-Length") || "0");
    if (contentLength > MAX_BODY_BYTES) {
      return json({ error: "payload_too_large" }, 413, request, env);
    }

    let body;
    try {
      body = await readJSONBody(request);
    } catch (error) {
      if (error instanceof RangeError) {
        return json({ error: "payload_too_large" }, 413, request, env);
      }
      return json({ error: "invalid_json" }, 400, request, env);
    }

    const validation = validateFeedback(body);
    if (!validation.ok) {
      return json({ error: validation.error }, 400, request, env);
    }

    const receivedAt = new Date().toISOString();
    const id = crypto.randomUUID();
    const record = {
      id,
      receivedAt,
      source: "dashcam-offloader-app",
      ...sanitizeFeedback(body),
    };

    if (!hasStorageBinding(env)) {
      return json({ error: "storage_not_configured" }, 503, request, env);
    }

    await storeRecord(env, id, record);

    return json({ ok: true, id }, 202, request, env);
  },
};

async function checkRateLimit(request, env) {
  const salt = String(env.RATE_LIMIT_SALT || "");
  if (!env.FEEDBACK_RATE_LIMITER || salt.length < 32) {
    return { ok: false, retryAfterSeconds: RATE_LIMIT_WINDOW_SECONDS };
  }

  const clientID = await hashedClientID(request, env);
  const objectID = env.FEEDBACK_RATE_LIMITER.idFromName(clientID);
  const response = await env.FEEDBACK_RATE_LIMITER.get(objectID).fetch("https://rate-limit/check", {
    method: "POST",
  });
  return response.json();
}

export class FeedbackRateLimiter {
  constructor(state) {
    this.state = state;
  }

  async fetch() {
    const now = Date.now();
    const windowStart = Math.floor(now / (RATE_LIMIT_WINDOW_SECONDS * 1000));
    const result = await this.state.storage.transaction(async (storage) => {
      const stored = await storage.get("current");
      const current = stored?.windowStart === windowStart ? stored : { windowStart, count: 0 };
      if (current.count >= RATE_LIMIT_MAX_POSTS) {
        const nextWindowAt = (windowStart + 1) * RATE_LIMIT_WINDOW_SECONDS * 1000;
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((nextWindowAt - now) / 1000)) };
      }
      current.count += 1;
      await storage.put("current", current);
      return { ok: true };
    });
    return Response.json(result);
  }
}

async function readJSONBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("missing_body");
  const chunks = [];
  let byteLength = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_BODY_BYTES) throw new RangeError("payload_too_large");
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function hashedClientID(request, env) {
  const rawClient = request.headers.get("CF-Connecting-IP") || "unknown";
  return clientFingerprint(rawClient, String(env.RATE_LIMIT_SALT || ""));
}

async function clientFingerprint(rawClient, salt) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}:${rawClient}`)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function validateFeedback(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body_must_be_object" };
  }

  if (!["bug", "feature", "training", "other"].includes(body.kind)) {
    return { ok: false, error: "invalid_kind" };
  }

  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return { ok: false, error: "message_required" };
  }

  if (body.message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: "message_too_long" };
  }

  if (body.contact && (typeof body.contact !== "string" || body.contact.length > MAX_CONTACT_LENGTH)) {
    return { ok: false, error: "invalid_contact" };
  }

  if (body.kind === "training") {
    if (!body.training || typeof body.training !== "object" || Array.isArray(body.training)) {
      return { ok: false, error: "training_required" };
    }
    for (const field of ["manufacturer", "model", "channelSetup"]) {
      if (typeof body.training[field] !== "string" || body.training[field].trim().length === 0) {
        return { ok: false, error: `training_${field}_required` };
      }
      if (body.training[field].length > MAX_TRAINING_FIELD_LENGTH) {
        return { ok: false, error: `training_${field}_too_long` };
      }
    }
  }

  if (body.scan !== null && body.scan !== undefined) {
    const scan = body.scan;
    if (typeof scan !== "object" || Array.isArray(scan)) {
      return { ok: false, error: "invalid_scan" };
    }
    if (Array.isArray(scan.sampleRelativePaths) && scan.sampleRelativePaths.length > MAX_SAMPLE_PATHS) {
      return { ok: false, error: "too_many_sample_paths" };
    }
    if (Array.isArray(scan.settingSnapshots) && scan.settingSnapshots.length > MAX_SETTING_SNAPSHOTS) {
      return { ok: false, error: "too_many_setting_snapshots" };
    }
  }

  return { ok: true };
}

function sanitizeFeedback(body) {
  const scan = body.scan ? sanitizeScan(body.scan) : null;

  return {
    kind: body.kind,
    message: body.message.trim(),
    contact: String(body.contact || "").trim(),
    appVersion: String(body.appVersion || ""),
    createdAt: String(body.createdAt || ""),
    training: body.training ? sanitizeTraining(body.training) : null,
    scan,
  };
}

function sanitizeTraining(training) {
  return {
    manufacturer: stringValue(training.manufacturer).trim(),
    model: stringValue(training.model).trim(),
    channelSetup: stringValue(training.channelSetup).trim(),
    notes: stringValue(training.notes).trim(),
  };
}

function safeMediaBasename(name) {
  return typeof name === "string" &&
    /^(?:\d{4}_\d{4}_\d{6}_\d{1,9}(?:PF|PR|PI|PT|F|R|I|T)|[A-Z]{1,4}\d{6,12}[A-Z0-9]{0,3})\.(?:MP4|MOV|JPG|JPEG)$/i.test(name);
}

function sampledFilenamePatterns(names) {
  const counts = new Map();
  for (const name of names) {
    const match = /^\d{4}_\d{4}_\d{6}_\d{1,9}(PF|PR|PI|PT|F|R|I|T)\.(MP4|MOV|JPG|JPEG)$/i.exec(name);
    if (!match) continue;
    const pattern = `YYYY_MMDD_HHMMSS_SEQUENCE${match[1].toUpperCase()}.${match[2].toUpperCase()}`;
    counts.set(pattern, (counts.get(pattern) || 0) + 1);
  }
  return [...counts].map(([redactedPattern, sampledCount]) => ({redactedPattern, sampledCount}));
}

const CAMERA_DIRECTORIES = new Set([
  "dcim", "movie", "movies", "photo", "photos", "parking", "park", "ro", "normal",
  "event", "events", "emergency", "manual", "protected", "record", "recordings",
  "video", "videos", "front", "rear", "interior", "cabin", "telephoto", "side",
  "continuous", "motion", "impact", "timelapse", "sos", "cont_rec", "evt_rec",
  "manual_rec", "parking_rec", "motion_rec", "sos_rec", "incabin_rec", "normal_rec",
  "event_rec", "park_rec", "inf_rec", "photo_rec", "blackvue", "teslacam", "recentclips",
  "savedclips", "sentryclips", "roadscout", "escort_m1", "maxcam360c", "rec", "clip",
  "inf", "pevent", "lapse", "lockedvideo", "secvideo", "safety_box", "bookmark",
  "originalfiles", "panophoto", "private", "avchd", "m4root", "360cardvr", "100",
  "back_emr", "back_norm", "front_emer", "rear_emer", "front_norm", "rear_norm",
  "emr", "norm", "motion_timelapse_rec",
]);

function cameraFolder(path) {
  if (path === ".") return path;
  if (typeof path !== "string" || path.length > 1024) return null;
  const parts = path.split("/");
  return parts.length <= 12 && parts.every(part => CAMERA_DIRECTORIES.has(part.toLowerCase()) ||
    /^(?:\d{3}[A-Za-z]{3,8}|folder-[1-9]\d{0,3})$/.test(part)) ? path : null;
}

function mediaFileSample(sample) {
  if (!sample || typeof sample !== "object" || Array.isArray(sample)) return null;
  const folder = cameraFolder(sample.folder);
  if (!folder || !safeMediaBasename(sample.filename)) return null;
  const bits = Number.isInteger(sample.permissionBits) && sample.permissionBits >= 0 && sample.permissionBits <= 0o777
    ? sample.permissionBits : null;
  const flag = value => typeof value === "boolean" ? value : null;
  const token = value => typeof value === "string" && /^[a-zA-Z0-9 _/-]{1,80}$/.test(value) ? value : null;
  return {folder, filename: sample.filename, mode: token(sample.mode),
    outputCategory: token(sample.outputCategory), channel: token(sample.channel),
    fileSizeBytes: nullableNumber(sample.fileSizeBytes), permissionBits: bits,
    filesystemReadOnly: bits === null ? null : (bits & 0o222) === 0,
    userImmutable: flag(sample.userImmutable), systemImmutable: flag(sample.systemImmutable),
    volumeReadOnly: flag(sample.volumeReadOnly)};
}

function sanitizeScan(scan) {
  const filenameSamples = Array.isArray(scan.filenameSamples)
    ? scan.filenameSamples.slice(0, 100).filter(safeMediaBasename)
    : [];
  return {
    // Names and paths can be personal data on NAS and regular-video imports.
    identifiedCamera: sanitizeIdentifiedCamera(scan.identifiedCamera),
    selectedProfileID: optionalString(scan.selectedProfileID),
    selectedProfileName: optionalString(scan.selectedProfileName),
    scannedFiles: numberValue(scan.scannedFiles),
    copyableItems: numberValue(scan.copyableItems),
    excludedItems: numberValue(scan.excludedItems),
    categoryCounts: countMap(scan.categoryCounts),
    modeCounts: countMap(scan.modeCounts),
    displayModeCounts: countMap(scan.displayModeCounts),
    outputCategoryCounts: countMap(scan.outputCategoryCounts),
    channelCounts: countMap(scan.channelCounts),
    extensionCounts: countMap(scan.extensionCounts),
    mediaExtensionCounts: countMap(scan.mediaExtensionCounts),
    unrecognizedExtensionCounts: countMap(scan.unrecognizedExtensionCounts),
    timestampSourceCounts: countMap(scan.timestampSourceCounts),
    suspiciousTimestampItems: numberValue(scan.suspiciousTimestampItems),
    inferredParkingPatternCounts: countMap(scan.inferredParkingPatternCounts),
    // Exact bounded camera-media basenames, never source paths or arbitrary names.
    filenameSamples,
    filenamePatternSummaries: sampledFilenamePatterns(filenameSamples),
    directorySummaries: Array.isArray(scan.directorySummaries) ? scan.directorySummaries.slice(0, 160)
      .filter(summary => summary && cameraFolder(summary.path)).map(summary => ({
        ...sanitizeDirectorySummary(summary), path: cameraFolder(summary.path), sampleFilenames: []
      })) : [],
    folderSummaries: Array.isArray(scan.folderSummaries) ? scan.folderSummaries.slice(0, 160)
      .filter(summary => summary && cameraFolder(summary.path)).map(sanitizeFolderSummary).filter(Boolean) : [],
    rootFolders: Array.isArray(scan.rootFolders) ? scan.rootFolders.slice(0, 160).filter(path => cameraFolder(path)) : [],
    mediaFileSamples: Array.isArray(scan.mediaFileSamples) ? scan.mediaFileSamples.slice(0, 120).map(mediaFileSample).filter(Boolean) : [],
    videoSpecSamples: [],
    videoSpecSummaries: Array.isArray(scan.videoSpecSummaries)
      ? scan.videoSpecSummaries.slice(0, MAX_VIDEO_SPEC_SUMMARIES).map(sanitizeVideoSpecSummary).filter(Boolean)
      : [],
    settingSnapshots: Array.isArray(scan.settingSnapshots)
      ? scan.settingSnapshots.slice(0, MAX_SETTING_SNAPSHOTS).map(sanitizeSettingSnapshot).filter(Boolean)
      : [],
    candidates: Array.isArray(scan.candidates)
      ? scan.candidates.slice(0, 12).map(sanitizeCandidate)
      : [],
    scanDiagnostics: Array.isArray(scan.scanDiagnostics)
      ? scan.scanDiagnostics.slice(0, 40).map(sanitizeScanDiagnostic)
      : [],
  };
}

function sanitizeDirectorySummary(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  const path = sanitizePath(summary.path || ".");
  if (!path) {
    return null;
  }

  return {
    path,
    depth: numberValue(summary.depth),
    childDirectoryCount: numberValue(summary.childDirectoryCount),
    directFileCount: numberValue(summary.directFileCount),
    directMediaFileCount: numberValue(summary.directMediaFileCount),
    directSupportFileCount: numberValue(summary.directSupportFileCount),
    directHiddenFileCount: numberValue(summary.directHiddenFileCount),
    directPlaceholderFileCount: numberValue(summary.directPlaceholderFileCount),
    directTotalFileSizeBytes: numberValue(summary.directTotalFileSizeBytes),
    extensionCounts: countMap(summary.extensionCounts),
    sampleFilenames: safePathList(summary.sampleFilenames, 8),
  };
}

function sanitizeIdentifiedCamera(camera) {
  if (!camera || typeof camera !== "object" || Array.isArray(camera)) {
    return null;
  }

  const manufacturer = stringValue(camera.manufacturer).trim();
  const model = stringValue(camera.model).trim();
  if (!manufacturer || !model) {
    return null;
  }

  return {
    manufacturer,
    model,
    evidence: [],
    isSupported: Boolean(camera.isSupported),
  };
}

function sanitizeFolderSummary(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  const path = sanitizePath(summary.path);
  if (!path) {
    return null;
  }

  return {
    path,
    fileCount: numberValue(summary.fileCount),
    mediaFileCount: numberValue(summary.mediaFileCount),
    supportFileCount: numberValue(summary.supportFileCount),
    totalFileSizeBytes: numberValue(summary.totalFileSizeBytes),
    minFileSizeBytes: nullableNumber(summary.minFileSizeBytes),
    maxFileSizeBytes: nullableNumber(summary.maxFileSizeBytes),
    extensionCounts: countMap(summary.extensionCounts),
  };
}

function sanitizeFilenamePatternSummary(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  const folder = sanitizePath(summary.folder || ".");
  const redactedPattern = stringValue(summary.redactedPattern);
  if (!folder || !redactedPattern || isSensitiveSettingPair(redactedPattern, "")) {
    return null;
  }

  return {
    folder,
    extensionLowercased: stringValue(summary.extensionLowercased).toLowerCase(),
    redactedPattern,
    fileCount: numberValue(summary.fileCount),
    totalFileSizeBytes: numberValue(summary.totalFileSizeBytes),
    sampleRelativePaths: safePathList(summary.sampleRelativePaths, 8),
  };
}

function sanitizeFilenameSequenceSummary(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  const folder = sanitizePath(summary.folder || ".");
  const prefix = stringValue(summary.prefix).trim();
  if (!folder || !prefix || isSensitiveSettingPair(prefix, "")) {
    return null;
  }

  return {
    folder,
    prefix,
    extensionLowercased: stringValue(summary.extensionLowercased).toLowerCase(),
    fileCount: numberValue(summary.fileCount),
    firstSequence: nullableNumber(summary.firstSequence),
    lastSequence: nullableNumber(summary.lastSequence),
    totalFileSizeBytes: numberValue(summary.totalFileSizeBytes),
    sampleRelativePaths: safePathList(summary.sampleRelativePaths, 8),
  };
}

function sanitizeClipGroupSummary(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  return {
    folder: ".",
    extensionLowercased: stringValue(summary.extensionLowercased).toLowerCase(),
    mode: optionalString(summary.mode),
    displayMode: optionalString(summary.displayMode),
    outputCategory: optionalString(summary.outputCategory),
    channel: optionalString(summary.channel),
    displayChannel: optionalString(summary.displayChannel),
    inferredParkingPattern: optionalString(summary.inferredParkingPattern),
    fileCount: numberValue(summary.fileCount),
    totalFileSizeBytes: numberValue(summary.totalFileSizeBytes),
    minFileSizeBytes: nullableNumber(summary.minFileSizeBytes),
    maxFileSizeBytes: nullableNumber(summary.maxFileSizeBytes),
    firstTimestamp: null,
    lastTimestamp: null,
    timestampSourceCounts: countMap(summary.timestampSourceCounts),
    sampleRelativePaths: [],
  };
}

function sanitizeVideoSpecSample(sample) {
  if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
    return null;
  }

  return {
    relativePath: "",
    extensionLowercased: stringValue(sample.extensionLowercased).toLowerCase(),
    fileSizeBytes: nullableNumber(sample.fileSizeBytes),
    mode: optionalString(sample.mode),
    displayMode: optionalString(sample.displayMode),
    outputCategory: optionalString(sample.outputCategory),
    channel: optionalString(sample.channel),
    inferredParkingPattern: optionalString(sample.inferredParkingPattern),
    codec: optionalString(sample.codec),
    width: nullableNumber(sample.width),
    height: nullableNumber(sample.height),
    nominalFrameRate: nullableNumber(sample.nominalFrameRate),
    estimatedBitrate: nullableNumber(sample.estimatedBitrate),
    durationSeconds: nullableNumber(sample.durationSeconds),
  };
}

// Accept measurements only, never paths, times, GPS, or arbitrary nested fields.
function sanitizeStorageRateSample(sample) {
  if (!sample || typeof sample !== "object" || Array.isArray(sample)) return null;
  const size = sample.fileSizeBytes, duration = sample.durationSeconds;
  if (!Number.isSafeInteger(size) || size <= 0 || size > 1e12 ||
      !Number.isFinite(duration) || duration <= 0 || duration > 86400) return null;
  const positive = (value, max) => Number.isFinite(value) && value > 0 && value <= max ? value : null;
  return {
    fileSizeBytes: size,
    durationSeconds: duration,
    width: positive(sample.width, 32768),
    height: positive(sample.height, 32768),
    nominalFrameRate: positive(sample.nominalFrameRate, 1000),
    videoBitrate: positive(sample.videoBitrate, 1e10),
  };
}

function sanitizeVideoSpecSummary(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  return {
    folder: cameraFolder(summary.folder) || ".",
    extensionLowercased: stringValue(summary.extensionLowercased).toLowerCase(),
    mode: optionalString(summary.mode),
    displayMode: optionalString(summary.displayMode),
    outputCategory: optionalString(summary.outputCategory),
    channel: optionalString(summary.channel),
    inferredParkingPattern: optionalString(summary.inferredParkingPattern),
    fileCount: numberValue(summary.fileCount),
    totalFileSizeBytes: numberValue(summary.totalFileSizeBytes),
    minFileSizeBytes: nullableNumber(summary.minFileSizeBytes),
    maxFileSizeBytes: nullableNumber(summary.maxFileSizeBytes),
    firstTimestamp: null,
    lastTimestamp: null,
    timestampSourceCounts: countMap(summary.timestampSourceCounts),
    sampleRelativePaths: [],
    sampleCodecs: stringList(summary.sampleCodecs, 6),
    sampleResolutions: stringList(summary.sampleResolutions, 6),
    sampleFrameRates: numberList(summary.sampleFrameRates, 6),
    sampleBitrateMin: nullableNumber(summary.sampleBitrateMin),
    sampleBitrateMax: nullableNumber(summary.sampleBitrateMax),
    sampleDurationMin: nullableNumber(summary.sampleDurationMin),
    sampleDurationMax: nullableNumber(summary.sampleDurationMax),
    storageRateSamples: Array.isArray(summary.storageRateSamples)
      ? summary.storageRateSamples.slice(0, 64).map(sanitizeStorageRateSample).filter(Boolean)
      : [],
  };
}

function sanitizeSettingSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }

  const rawValues = snapshot.safeValues && typeof snapshot.safeValues === "object" && !Array.isArray(snapshot.safeValues)
    ? snapshot.safeValues
    : {};
  const safeValues = {};

  for (const [key, value] of Object.entries(rawValues).slice(0, MAX_SETTING_VALUES)) {
    if (isSafeSettingPair(key, value)) {
      safeValues[stringValue(key)] = stringValue(value);
    }
  }

  const keys = Array.isArray(snapshot.keys)
    ? snapshot.keys
        .slice(0, MAX_SETTING_VALUES)
        .map(stringValue)
        .filter((key) => isSafeSettingPair(key, ""))
    : Object.keys(safeValues);

  if (keys.length === 0 && Object.keys(safeValues).length === 0) {
    return null;
  }

  return {
    relativePath: "",
    keys,
    safeValues,
  };
}

function sanitizeCandidate(candidate) {
  return {
    profileID: aggregateKey(candidate.profileID),
    profileName: aggregateKey(candidate.profileName),
    score: numberValue(candidate.score),
    confidence: stringValue(candidate.confidence),
    evidence: [],
  };
}

function sanitizeScanDiagnostic(diagnostic) {
  return {
    stage: aggregateKey(diagnostic.stage),
    profileID: optionalString(diagnostic.profileID),
    profileName: optionalString(diagnostic.profileName),
    outcome: aggregateKey(diagnostic.outcome),
    detail: "",
  };
}

function countMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result = {};
  for (const [key, count] of Object.entries(value)) {
    const safeKey = aggregateKey(key);
    if (safeKey) result[safeKey] = numberValue(count);
  }
  return result;
}

function aggregateKey(value) {
  const key = stringValue(value).trim().slice(0, 64);
  if (!key || isSensitiveSettingPair(key, "")) return "";
  if (/[@/\\]/.test(key) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(key)) return "";
  return /^[\p{L}\p{N}][\p{L}\p{N} ._+()\[\]-]*$/u.test(key) ? key : "";
}

function stringValue(value) {
  return typeof value === "string" ? value.slice(0, 1000) : "";
}

function sanitizePath(value) {
  return stringValue(value)
    .split("/")
    .filter((part) => !isSensitiveSettingPair(part, ""))
    .join("/")
    .slice(0, 1000);
}

function safePathList(value, limit) {
  if (!Array.isArray(value)) {
    return [];
  }
  const result = [];
  for (const item of value.slice(0, limit)) {
    const raw = stringValue(item);
    if (!raw || isSensitiveSettingPair(raw, "")) {
      continue;
    }
    const sanitized = sanitizePath(raw);
    if (sanitized) {
      result.push(sanitized);
    }
  }
  return result;
}

function stringList(value, limit) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, limit)
    .map(aggregateKey)
    .filter((item) => item.length > 0);
}

function numberList(value, limit) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, limit)
    .map(nullableNumber)
    .filter((item) => item !== null);
}

function optionalString(value) {
  const result = aggregateKey(value);
  return result || null;
}

function numberValue(value) {
  return Number.isFinite(value) ? value : 0;
}

function nullableNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function isSafeSettingPair(key, value) {
  return !isSensitiveSettingPair(key, value) && isUsefulSettingKey(key);
}

function isUsefulSettingKey(key) {
  const normalized = stringValue(key).toLowerCase();
  const usefulFragments = [
    "model",
    "firmware",
    "version",
    "fw",
    "camera",
    "resolution",
    "quality",
    "bitrate",
    "bit rate",
    "parking",
    "motion",
    "impact",
    "timelapse",
    "time lapse",
    "low bitrate",
    "fps",
    "frame",
    "codec",
    "encoding",
    "hdr",
    "wdr",
    "loop",
    "audio",
    "microphone",
    "gps",
    "speed",
    "timezone",
    "time zone",
    "frequency",
    "exposure",
    "ev",
    "channel",
  ];
  return usefulFragments.some((fragment) => normalized.includes(fragment));
}

function isSensitiveSettingPair(key, value) {
  const combined = `${stringValue(key)} ${stringValue(value)}`.toLowerCase();
  const sensitiveFragments = [
    "password",
    "passwd",
    "pwd",
    "ssid",
    "wifi",
    "wi-fi",
    "cloud",
    "account",
    "email",
    "token",
    "secret",
    "serial",
    "imei",
    "uuid",
    "uid",
    "device id",
    "deviceid",
    "mac address",
    "bluetooth",
    "latitude",
    "longitude",
    "coordinate",
    "license",
    "plate",
  ];
  return sensitiveFragments.some((fragment) => combined.includes(fragment)) ||
    /-?\d{1,3}\.\d{4,}/.test(combined);
}

async function storeRecord(env, id, record) {
  const key = `feedback/${record.receivedAt.slice(0, 10)}/${id}.json`;
  const body = JSON.stringify(record, null, 2);

  if (env.FEEDBACK_BUCKET) {
    await env.FEEDBACK_BUCKET.put(key, body, {
      httpMetadata: { contentType: "application/json" },
    });
  }

  if (env.FEEDBACK_KV) {
    await env.FEEDBACK_KV.put(key, body);
  }
}

function hasStorageBinding(env) {
  return Boolean(env.FEEDBACK_BUCKET || env.FEEDBACK_KV);
}

function json(value, status = 200, request, env, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...responseHeaders(request, env),
      ...extraHeaders,
    },
  });
}

function responseHeaders(request, env) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(request, env),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

function allowedOrigin(request, env) {
  const origin = request?.headers?.get("Origin") || "";
  const configured = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured.length === 0) {
    return "*";
  }

  return configured.includes(origin) ? origin : configured[0];
}

export {
  validateFeedback,
  sanitizeFeedback,
  sanitizeScan,
  sanitizePath,
  safePathList,
  isSensitiveSettingPair,
  isSafeSettingPair,
  clientFingerprint,
};
