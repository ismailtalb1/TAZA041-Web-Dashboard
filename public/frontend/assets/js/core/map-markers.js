(function initTazaMapMarkers(global) {
  function markerSvg(kind) {
    if (kind === 'restaurant') {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5.75 3.5v6.25M8.25 3.5v6.25M4.5 7.25h5M7 9.75v10.75M16.75 3.5v17M16.75 3.5c2.1 1.55 3.05 3.7 3.05 6.45v1.3h-3.05" />
        </svg>`;
    }

    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 20.5V4.25M7.5 5h9.9l-2.15 3 2.15 3H7.5" />
        <path d="M4.75 20.5h4.5" />
      </svg>`;
  }

  function create(kind = 'destination') {
    if (!global.L?.divIcon) return null;
    const normalizedKind = kind === 'restaurant' ? 'restaurant' : 'destination';
    return global.L.divIcon({
      className: `taza-map-marker taza-map-marker-${normalizedKind}`,
      html: `<span class="taza-map-marker-pin"><span class="taza-map-marker-glyph">${markerSvg(normalizedKind)}</span></span>`,
      iconSize: [44, 52],
      iconAnchor: [22, 50],
      popupAnchor: [0, -46]
    });
  }

  global.TazaMapMarkers = Object.freeze({ create });
})(window);
