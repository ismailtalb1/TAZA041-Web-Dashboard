// Shared delivery geography for the checkout and saved-address maps.
// Simplified OpenStreetMap relation 184883 coastline around Latakia (ODbL).
window.TazaDeliveryGeo = (() => {
  const land = {
    type: 'Feature',
    properties: { name: 'Latakia coastal land' },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [35.7987237, 35.6850187], [35.7771311, 35.6794458], [35.7682469, 35.66967],
        [35.7680659, 35.6569591], [35.778016, 35.6511768], [35.7803233, 35.6371437],
        [35.7850064, 35.6329433], [35.7772623, 35.6178026], [35.7721801, 35.6170337],
        [35.7756043, 35.6082895], [35.7685423, 35.607689], [35.7667583, 35.6094388],
        [35.7700247, 35.6121364], [35.7638636, 35.6100194], [35.7583162, 35.5927474],
        [35.7513684, 35.5932084], [35.7494076, 35.5889186], [35.7431126, 35.5894988],
        [35.742018, 35.5929733], [35.7275819, 35.5847336], [35.7165688, 35.5859787],
        [35.7209692, 35.5785628], [35.7368216, 35.5842572], [35.7419614, 35.5816783],
        [35.7454595, 35.573909], [35.7396814, 35.5722949], [35.7406123, 35.5686516],
        [35.7328529, 35.5609759], [35.7389835, 35.5604855], [35.7386556, 35.5572478],
        [35.751532, 35.5506161], [35.7563508, 35.5514929], [35.7566711, 35.548552],
        [35.7519904, 35.5474556], [35.7531169, 35.5447006], [35.7598976, 35.5465214],
        [35.7642252, 35.5442689], [35.763002, 35.5418323], [35.7660113, 35.5436172],
        [35.7660497, 35.5400416], [35.76174, 35.5412533], [35.763509, 35.5393572],
        [35.768137, 35.5400139], [35.7720228, 35.5364225], [35.7720442, 35.5327293],
        [35.7654798, 35.5275594], [35.7709301, 35.5274353], [35.767245, 35.5162263],
        [35.771951, 35.5142864], [35.7686422, 35.5113229], [35.7662242, 35.5144589],
        [35.7617186, 35.5081268], [35.7596022, 35.5109088], [35.7630024, 35.5182462],
        [35.7548323, 35.5324031], [35.7621684, 35.5186496], [35.7593224, 35.5111413],
        [35.7594027, 35.5097334], [35.7636185, 35.5056726], [35.7698757, 35.5043687],
        [35.7787174, 35.4962412], [35.7836716, 35.5057817], [35.7876674, 35.5067795],
        [35.8024405, 35.5042309], [35.8167947, 35.4963674], [35.8726649, 35.458791],
        [35.9140876, 35.4192887], [35.9152211, 35.4145434], [35.9111001, 35.4112344],
        [35.9214392, 35.3813019], [36.2, 35.35], [36.2, 35.72], [35.7987237, 35.6850187]
      ]]
    }
  };

  function isPointOnLand(lat, lng) {
    const ring = land.geometry.coordinates[0];
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const crosses = ((yi > lat) !== (yj > lat))
        && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function distanceKm(lat1, lon1, lat2, lon2) {
    const earthRadiusKm = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function createLandOnlyArea(restaurantLat, restaurantLng, radiusKm = 15) {
    if (!window.turf) return null;
    const circle = turf.circle([restaurantLng, restaurantLat], radiusKm, { steps: 180, units: 'kilometers' });
    try {
      return turf.intersect(turf.featureCollection([circle, land]));
    } catch (error) {
      console.warn('Unable to clip the delivery range to the coastline.', error);
      return null;
    }
  }

  return { land, isPointOnLand, distanceKm, createLandOnlyArea };
})();
