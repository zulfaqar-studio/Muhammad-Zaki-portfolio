import { useEffect, useMemo, useState } from 'react';
import fallbackPortfolio from '../data/portfolio.default.json';
import { fetchJson } from '../lib/api';

function normalize(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\/+/, '').toLowerCase();
}

function resolveRelative(ref) {
  if (!ref || typeof ref !== 'string') return ref;
  const value = ref.trim();
  if (!value) return value;
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  if (value.startsWith('/Muhammad-Zaki-portfolio/')) return value;
  const withoutLeadingSlash = value.replace(/^\/+/, '');
  const assetPath = withoutLeadingSlash.replace(/^public\//i, '').replace(/^\.\//, '');
  return `${import.meta.env.BASE_URL}${assetPath}`;
}

function driveMediaUrl(file) {
  if (!file?.id) return '';
  return file.viewUrl || `https://drive.google.com/uc?export=view&id=${encodeURIComponent(file.id)}`;
}

function makeDriveIndex(files) {
  const byId = new Map();
  const byName = new Map();
  for (const file of files || []) {
    if (!file?.id) continue;
    byId.set(file.id, file);
    const name = normalize(file.name);
    if (name && !byName.has(name)) byName.set(name, file);
  }
  return { byId, byName, size: byId.size };
}

function makeStaticIndex(data) {
  return {
    byPath: new Map(Object.entries(data?.byPath || {})),
    byName: new Map(Object.entries(data?.byName || {})),
    size: Array.isArray(data?.files) ? data.files.length : 0
  };
}

function staticPathFor(ref, staticIndex) {
  const value = String(ref || '').trim();
  if (!value || /^(https?:|data:|blob:|drive:\/\/)/i.test(value)) return '';
  const normalized = normalize(value.replace(/^public\//i, ''));
  if (staticIndex?.byPath.has(normalized)) return resolveRelative(staticIndex.byPath.get(normalized));
  if (staticIndex?.byName.has(normalized)) return resolveRelative(staticIndex.byName.get(normalized));
  return resolveRelative(value);
}

function driveFallbackFor(ref, driveIndex) {
  const value = String(ref || '').trim();
  if (!value) return '';
  const driveMatch = value.match(/^drive:\/\/(.+)$/i);
  if (driveMatch) return driveMediaUrl(driveIndex?.byId.get(driveMatch[1]));
  const name = normalize(value.split('/').pop());
  return driveMediaUrl(driveIndex?.byName.get(name));
}

function resolveMediaRef(ref, staticIndex, driveIndex) {
  if (!ref || typeof ref !== 'string') return { src: '', fallback: '' };
  const value = ref.trim();
  if (!value) return { src: '', fallback: '' };

  const driveMatch = value.match(/^drive:\/\/(.+)$/i);
  if (driveMatch) {
    return { src: driveMediaUrl(driveIndex?.byId.get(driveMatch[1])), fallback: '', originalRef: value };
  }
  if (/^(https?:|data:|blob:)/i.test(value)) return { src: value, fallback: '', originalRef: value };

  const staticSrc = staticPathFor(value, staticIndex);
  const driveFallback = driveFallbackFor(value, driveIndex);
  return { src: staticSrc, fallback: driveFallback && driveFallback !== staticSrc ? driveFallback : '', originalRef: value };
}

function applyMediaResolver(portfolio, staticIndex, generalIndex, certIndex) {
  const next = {
    ...portfolio,
    profile: { ...(portfolio?.profile || {}) },
    certifications: (portfolio?.certifications || []).map((cert) => {
      const media = resolveMediaRef(cert.image, staticIndex, certIndex);
      return { ...cert, image: media.src, imageFallback: media.fallback, originalRef: media.originalRef };
    }),
    workExperience: (portfolio?.workExperience || []).map((work) => ({
      ...work,
      media: (work.media || []).map((item) => {
        if (!item) return item;
        if (!item.src) return item;
        const media = resolveMediaRef(item.src, staticIndex, generalIndex);
        return { ...item, src: media.src, srcFallback: media.fallback, originalRef: media.originalRef };
      })
    })),
    projects: portfolio?.projects || [],
    skills: portfolio?.skills || []
  };
  const portrait = resolveMediaRef(next.profile.portraitUrl, staticIndex, generalIndex);
  next.profile.portraitUrl = portrait.src;
  next.profile.portraitFallback = portrait.fallback;
  next.profile.portraitOriginalRef = portrait.originalRef;
  return next;
}

async function loadPublishedMediaManifests() {
  const [staticResponse, driveResponse] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}data/static-media.json`, { cache: 'default' }),
    fetch(`${import.meta.env.BASE_URL}data/drive-media.json`, { cache: 'default' })
  ]);

  let staticData = {};
  let driveData = {};
  if (staticResponse.ok) staticData = await staticResponse.json();
  if (driveResponse.ok) driveData = await driveResponse.json();

  const files = Array.isArray(driveData?.files) ? driveData.files : [];
  return {
    static: makeStaticIndex(staticData),
    general: makeDriveIndex(files.filter((file) => file?.kind !== 'certificates')),
    certificates: makeDriveIndex(files.filter((file) => file?.kind === 'certificates'))
  };
}

export function usePortfolio() {
  const emptyStatic = { byPath: new Map(), byName: new Map(), size: 0 };
  const emptyDrive = { byId: new Map(), byName: new Map(), size: 0 };
  const [portfolio, setPortfolio] = useState(() => applyMediaResolver(fallbackPortfolio, emptyStatic, emptyDrive, emptyDrive));
  const [loading, setLoading] = useState(true);
  const [driveMediaReady, setDriveMediaReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      (import.meta.env.DEV
        ? fetchJson('/api/content', { timeoutMs: 3500, retries: 0 })
            .then((payload) => payload?.content)
            .catch(() => fallbackPortfolio)
        : Promise.resolve(fallbackPortfolio)
      ),
      loadPublishedMediaManifests().catch(() => ({ static: emptyStatic, general: emptyDrive, certificates: emptyDrive }))
    ])
      .then(([data, media]) => {
        if (cancelled) return;
        setPortfolio(applyMediaResolver(data, media.static, media.general, media.certificates));
        setDriveMediaReady(Boolean(media.general.size || media.certificates.size));
      })
      .catch(() => { /* bundled fallback remains visible */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { ...portfolio, loading, driveMediaReady };
}
