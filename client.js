const API_URLS = {
    countries: '/countries',
    airlinesAll: '/airlines/all',
    airportsAll: '/airports/all',
    airlines: '/airlines',
    airports: '/airports',
    routes: '/routes',
    routesFrom: '/routes/from',
    routesTo: '/routes/to',
    routesDistance: '/routes/distance'
  };
  
  // --- Map Setup ---
  const map = L.map('map').setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(map);
  let mapMarkers = L.layerGroup().addTo(map);
  let mapRoutes = L.layerGroup().addTo(map);
  
  // --- DOM Elements ---
  const input1 = document.getElementById('input1');
  const input2 = document.getElementById('input2');
  const searchTypeSelect = document.getElementById('searchType');
  const searchButton = document.getElementById('searchButton');
  const resultSection = document.getElementById('resultSection');
  const loading = document.getElementById('loading');
  const input1Container = input1.parentElement;
  const input2Container = document.getElementById('input2Container');
  
  // --- Data Cache ---
  let allCountries = [];
  let allAirlines = [];
  let allAirports = [];
  let allAirportsMap = new Map();
  let allAirlinesMap = new Map(); // *** ADDED: Map for airline lookup by IATA code ***
  
  // --- Helper Functions ---
  
  function displayError(message) {
    resultSection.innerHTML = `<p class="text-red-600 font-semibold mt-4"><i class="fas fa-exclamation-triangle mr-2"></i>${message}</p>`;
    loading.classList.add('hidden');
    clearMap();
  }
  
  function clearMap() {
    mapMarkers.clearLayers();
    mapRoutes.clearLayers();
  }
  
  function plotAirportsAndRoutes(airportsToPlot, routesToPlot = [], focusAirportIata = null) {
    clearMap();
    const markers = [];
    const validAirports = airportsToPlot.filter(ap => ap && ap.latitude != null && ap.longitude != null);
  
    validAirports.forEach(ap => {
      const marker = L.marker([ap.latitude, ap.longitude], {
          title: `${ap.name} (${ap.iata || 'N/A'})`
      })
        .bindPopup(`<b>${ap.name}</b> (${ap.iata || 'N/A'})<br>${ap.city || ''}, ${ap.country || ''}`)
        .addTo(mapMarkers);
      markers.push(marker);
    });
  
    routesToPlot.forEach(route => {
      const dep = allAirportsMap.get(route.departure?.toUpperCase());
      const arr = allAirportsMap.get(route.arrival?.toUpperCase());
  
      if (dep && arr && dep.latitude != null && dep.longitude != null && arr.latitude != null && arr.longitude != null) {
        L.polyline([[dep.latitude, dep.longitude], [arr.latitude, arr.longitude]], {
            color: 'rgba(0, 0, 200, 0.6)',
            weight: 2
         })
          .bindPopup(`Route: ${dep.iata} <i class="fas fa-plane mx-1"></i> ${arr.iata}<br>Airline: ${route.airline || 'N/A'}`)
          .addTo(mapRoutes);
      }
    });
  
    if (markers.length > 1) {
      const group = new L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.3));
    } else if (markers.length === 1) {
      map.setView([markers[0].getLatLng().lat, markers[0].getLatLng().lng], 10);
    } else if (focusAirportIata) {
        const focusAirport = allAirportsMap.get(focusAirportIata.toUpperCase());
        if (focusAirport && focusAirport.latitude != null && focusAirport.longitude != null) {
            map.setView([focusAirport.latitude, focusAirport.longitude], 10);
        } else {
            map.setView([20, 0], 2);
        }
    }
    else {
      map.setView([20, 0], 2);
    }
  }
  
  // Simple list formatting (now expects pre-formatted strings)
  function formatList(items, title) {
    if (!items || items.length === 0) {
      return `<p class="mt-2 text-gray-600">No ${title.toLowerCase()} found.</p>`;
    }
    // Ensure items are sorted before rendering
    const sortedItems = [...items].sort((a, b) => a.localeCompare(b));
    return `<h3 class="text-lg font-semibold mt-4 mb-2">${title}:</h3><ul class="list-disc pl-6 space-y-1">${sortedItems.map(i => `<li class="text-gray-800">${i}</li>`).join('')}</ul>`;
  }
  
  
  function formatRoutesTable(routes, title) {
      if (!routes || routes.length === 0) {
          return `<p class="mt-2 text-gray-600">No ${title.toLowerCase()} found.</p>`;
      }
      const tableRows = routes.map(r => {
          const airlineInfo = allAirlinesMap.get(r.airline?.toUpperCase());
          const airlineDisplay = airlineInfo ? `${airlineInfo.name} (${r.airline})` : r.airline || 'N/A';
          return `
              <tr class="hover:bg-gray-50">
                  <td class="px-4 py-2 border border-gray-300">${airlineDisplay}</td>
                  <td class="px-4 py-2 border border-gray-300">${r.departure || 'N/A'}</td>
                  <td class="px-4 py-2 border border-gray-300">${r.arrival || 'N/A'}</td>
                  <td class="px-4 py-2 border border-gray-300">${r.planes || 'N/A'}</td>
              </tr>
          `;
      }).join('');
  
      return `
          <h3 class="text-lg font-semibold mt-4 mb-2">${title}:</h3>
          <div class="overflow-x-auto">
              <table class="min-w-full table-auto border border-collapse border-gray-300">
                  <thead class="bg-gray-100">
                      <tr>
                          <th class="px-4 py-2 border border-gray-300 text-left">Airline</th>
                          <th class="px-4 py-2 border border-gray-300 text-left">From</th>
                          <th class="px-4 py-2 border border-gray-300 text-left">To</th>
                          <th class="px-4 py-2 border border-gray-300 text-left">Planes</th>
                      </tr>
                  </thead>
                  <tbody>${tableRows}</tbody>
              </table>
          </div>
      `;
  }
  
  
  function formatAirportDetails(ap) {
    if (!ap) return '<p class="text-red-500">Airport details not available.</p>';
  
    const lat = ap.latitude != null ? parseFloat(ap.latitude) : null;
    const lon = ap.longitude != null ? parseFloat(ap.longitude) : null;
    const displayLat = typeof lat === 'number' && !isNaN(lat) ? lat.toFixed(4) : 'N/A';
    const displayLon = typeof lon === 'number' && !isNaN(lon) ? lon.toFixed(4) : 'N/A';
  
    return `
      <h2 class="text-2xl font-bold mb-3">${ap.name || 'N/A'} (${ap.iata || 'N/A'})</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
              <p><strong>City:</strong> ${ap.city || 'N/A'}</p>
              <p><strong>Country:</strong> ${ap.country || 'N/A'}</p>
              <p><strong>IATA:</strong> ${ap.iata || 'N/A'}</p>
              <p><strong>ICAO:</strong> ${ap.icao || 'N/A'}</p>
          </div>
          <div>
              <p><strong>Latitude:</strong> ${displayLat}</p>
              <p><strong>Longitude:</strong> ${displayLon}</p>
              ${ap.weather ? `
                  <div class="mt-3 pt-3 border-t">
                      <p class="font-semibold">Today's Weather:</p>
                      <p><i class="fas fa-temperature-high text-red-500 mr-1"></i> High: ${ap.weather.high}°${ap.weather.unit}</p>
                      <p><i class="fas fa-temperature-low text-blue-500 mr-1"></i> Low: ${ap.weather.low}°${ap.weather.unit}</p>
                  </div>
              ` : '<p class="mt-3 pt-3 border-t text-gray-500">Weather data not available.</p>'}
          </div>
      </div>
    `;
  }
  
  // --- Autocomplete Setup ---
  function createCustomDropdown(inputElement, listProvider) {
      const parentContainer = inputElement.parentNode;
      const existingDropdown = parentContainer.querySelector('.autocomplete-dropdown');
      if (existingDropdown) {
          existingDropdown.remove();
      }
  
      const dropdown = document.createElement('div');
      dropdown.className = 'autocomplete-dropdown absolute bg-white border rounded mt-1 w-full max-h-48 overflow-y-auto z-20 hidden shadow-lg transition-all duration-200';
      parentContainer.appendChild(dropdown);
  
      let currentFocus = -1;
  
      const updateDropdown = () => {
          const val = inputElement.value.toLowerCase().trim();
          dropdown.innerHTML = '';
          currentFocus = -1;
  
          if (!val) {
              dropdown.classList.add('hidden');
              return;
          }
  
          const list = typeof listProvider === 'function' ? listProvider() : listProvider;
          const filtered = list.filter(item => {
              const name = item.name?.toLowerCase() || '';
              const code = item.iata?.toLowerCase() || item.code?.toLowerCase() || '';
              return code.startsWith(val) || name.includes(val);
          }).slice(0, 7);
  
          if (filtered.length) {
              dropdown.classList.remove('hidden');
              filtered.forEach((item, index) => {
                  const div = document.createElement('div');
                  const codePart = item.iata ? `(${item.iata})` : (item.code ? `(${item.code})` : '');
                  let displayText = `${item.name} <span class="text-sm text-gray-500">${codePart}</span>`;
                   try {
                      const regex = new RegExp(`(${val})`, 'gi');
                      displayText = displayText.replace(regex, '<strong class="font-bold">$1</strong>');
                  } catch (e) { /* Ignore */ }
  
                  div.innerHTML = displayText;
                  div.className = 'p-2 hover:bg-blue-100 cursor-pointer text-sm';
                  div.dataset.value = item.iata || item.code;
  
                  div.addEventListener('click', () => {
                      inputElement.value = div.dataset.value;
                      dropdown.classList.add('hidden');
                  });
                  dropdown.appendChild(div);
              });
          } else {
              dropdown.classList.add('hidden');
          }
      };
  
      inputElement.addEventListener('input', updateDropdown);
      inputElement.addEventListener('focus', updateDropdown);
  
      inputElement.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('div');
        if (!items.length || dropdown.classList.contains('hidden')) return;
  
        if (e.key === 'ArrowDown') {
          currentFocus++;
          if (currentFocus >= items.length) currentFocus = 0;
          setActive(items, currentFocus);
          e.preventDefault();
        } else if (e.key === 'ArrowUp') {
          currentFocus--;
          if (currentFocus < 0) currentFocus = items.length - 1;
          setActive(items, currentFocus);
          e.preventDefault();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (currentFocus > -1) {
            items[currentFocus].click();
          } else if (items.length > 0) {
               items[0].click();
          }
           dropdown.classList.add('hidden');
        } else if (e.key === 'Escape') {
            dropdown.classList.add('hidden');
        }
      });
  
      function setActive(items, index) {
        if (!items) return;
        items.forEach(item => item.classList.remove('bg-blue-100'));
        if (index > -1 && items[index]) {
          items[index].classList.add('bg-blue-100');
          items[index].scrollIntoView({ block: 'nearest' });
        }
      }
  
      document.addEventListener('click', (e) => {
          if (!parentContainer.contains(e.target) && !dropdown.contains(e.target)) {
              dropdown.classList.add('hidden');
          }
      });
  }
  
  // --- Update Placeholders ---
  function updatePlaceholders() {
      const type = searchTypeSelect.value;
      let placeholder1 = "Enter code...";
      let placeholder2 = "Enter second code...";
      let showInput2 = false;
  
      switch (type) {
          case 'country': placeholder1 = "Country Code (e.g., US)"; break;
          case 'airline': placeholder1 = "Airline IATA (e.g., AA)"; break;
          case 'airportDetails':
          case 'from':
          case 'to':
          case 'toFrom': placeholder1 = "Airport IATA (e.g., JFK)"; break;
          case 'between':
              placeholder1 = "Departure Airport IATA";
              placeholder2 = "Arrival Airport IATA";
              showInput2 = true; break;
          case 'distance':
              placeholder1 = "From Airport IATA";
              placeholder2 = "To Airport IATA";
              showInput2 = true; break;
      }
  
      input1.placeholder = placeholder1;
      input1.value = '';
      input2.placeholder = placeholder2;
      input2.value = '';
  
      if (showInput2) { input2Container.classList.remove('hidden'); }
      else { input2Container.classList.add('hidden'); }
      setupAutocomplete();
  }
  
  // --- Main Search Logic ---
  searchButton.addEventListener('click', async () => {
    const type = searchTypeSelect.value;
    const val1 = input1.value.trim().toUpperCase();
    const val2 = input2.value.trim().toUpperCase();
    resultSection.innerHTML = '';
    loading.classList.remove('hidden');
    clearMap();
  
    if (!val1) { displayError("Please enter the required code in the first input field."); return; }
    if (['between', 'distance'].includes(type) && !val2) { displayError("Please enter the required code in the second input field for this search type."); return; }
    if (['between', 'distance'].includes(type) && val1 === val2) { displayError("Departure and arrival airports cannot be the same."); return; }
  
    if (type === 'country' && !allCountries.some(c => c.code === val1)) { displayError(`Invalid or unknown Country Code: ${val1}`); return; }
    if (['airline'].includes(type) && !allAirlinesMap.has(val1)) { displayError(`Invalid or unknown Airline IATA Code: ${val1}`); return; } // Use map for validation
    const airportTypes = ['airportDetails', 'from', 'to', 'toFrom', 'between', 'distance'];
    if (airportTypes.includes(type) && !allAirportsMap.has(val1)) { displayError(`Invalid or unknown Airport IATA Code: ${val1}`); return; }
    if (['between', 'distance'].includes(type) && !allAirportsMap.has(val2)) { displayError(`Invalid or unknown Airport IATA Code for second input: ${val2}`); return; }
  
    try {
      let airportsData = [];
      let routesData = [];
      let htmlResult = '';
      let focusAirport = null;
  
      switch (type) {
        case 'country': {
            // Fetch data
            const [airlinesRes, airportsRes] = await Promise.all([
                axios.get(`${API_URLS.airlines}?country_code=${val1}`).then(res => res.data),
                axios.get(`${API_URLS.airports}?country_code=${val1}`).then(res => res.data)
            ]);

            
            let countryName = val1; // Default to code if name not found
            const countryObj = allCountries.find(c => c.code.toUpperCase() === val1);
            if (countryObj) {
                countryName = countryObj.name;
            }

            htmlResult = `<h2 class="text-xl font-semibold mb-4 text-blue-800">Results for ${countryName} (${val1})</h2>` +
                         formatList(airlinesRes.map(a => `${a.name} (${a.iata || a.icao || '-'})`), 'Airlines') +
                         formatList(airportsRes.map(a => `${a.name} (${a.iata || a.icao || '-'}) - ${a.city || ''}`), 'Airports');

            airportsData = airportsRes;
            break;
        }
          case 'airline': {
              const routesRes = await axios.get(`${API_URLS.routes}?airline=${val1}`).then(res => res.data);
              htmlResult = formatRoutesTable(routesRes, `Routes for Airline ${val1}`);
              const airportCodes = new Set();
              routesRes.forEach(r => {
                  if (r.departure) airportCodes.add(r.departure);
                  if (r.arrival) airportCodes.add(r.arrival);
              });
              airportsData = [...airportCodes].map(code => allAirportsMap.get(code)).filter(Boolean);
              routesData = routesRes;
              break;
          }
          case 'airportDetails': {
              const ap = await axios.get(`${API_URLS.airports}?iata=${val1}`).then(res => res.data);
              htmlResult = formatAirportDetails(ap);
              airportsData = ap ? [ap] : [];
              break;
          }
          case 'from': {
              const routesRes = await axios.get(`${API_URLS.routesFrom}?departure=${val1}`).then(res => res.data);
              htmlResult = formatRoutesTable(routesRes, `Routes Departing from ${val1}`);
              const arrivalCodes = new Set(routesRes.map(r => r.arrival).filter(Boolean));
              const departureAirport = allAirportsMap.get(val1);
              const arrivalAirports = [...arrivalCodes].map(code => allAirportsMap.get(code)).filter(Boolean);
              airportsData = [departureAirport, ...arrivalAirports].filter(Boolean);
              routesData = routesRes;
              break;
          }
          case 'to': {
              const routesRes = await axios.get(`${API_URLS.routesTo}?arrival=${val1}`).then(res => res.data);
              htmlResult = formatRoutesTable(routesRes, `Routes Arriving at ${val1}`);
              const departureCodes = new Set(routesRes.map(r => r.departure).filter(Boolean));
              const arrivalAirport = allAirportsMap.get(val1);
              const departureAirports = [...departureCodes].map(code => allAirportsMap.get(code)).filter(Boolean);
              airportsData = [arrivalAirport, ...departureAirports].filter(Boolean);
              routesData = routesRes;
              break;
          }
         case 'toFrom': {
              const [fromRes, toRes] = await Promise.all([
                  axios.get(`${API_URLS.routesFrom}?departure=${val1}`).then(res => res.data),
                  axios.get(`${API_URLS.routesTo}?arrival=${val1}`).then(res => res.data)
              ]);
              const allRelatedRoutes = [...fromRes, ...toRes];
              const airlineCodes = [...new Set(allRelatedRoutes.map(r => r.airline).filter(Boolean))];
  
              const airlinesFormatted = airlineCodes.map(code => {
                  const airlineInfo = allAirlinesMap.get(code.toUpperCase());
                  return airlineInfo ? `${airlineInfo.name} (${code})` : `${code}`;
              });
              htmlResult = formatList(airlinesFormatted, `Airlines Flying To/From ${val1}`);
  
              const centerAirport = allAirportsMap.get(val1);
              airportsData = centerAirport ? [centerAirport] : [];
              focusAirport = val1;
              break;
          }
          case 'between': {
              const routesRes = await axios.get(`${API_URLS.routes}?departure=${val1}&arrival=${val2}`).then(res => res.data);
              const airlineCodes = [...new Set(routesRes.map(r => r.airline).filter(Boolean))];
  
              const airlinesFormatted = airlineCodes.map(code => {
                  const airlineInfo = allAirlinesMap.get(code.toUpperCase());
                  return airlineInfo ? `${airlineInfo.name} (${code})` : `${code}`;
              });
              htmlResult = formatList(airlinesFormatted, `Airlines Flying Between ${val1} and ${val2}`);
  
              const airport1 = allAirportsMap.get(val1);
              const airport2 = allAirportsMap.get(val2);
              airportsData = [airport1, airport2].filter(Boolean);
              routesData = routesRes;
              break;
          }
          case 'distance': {
              const distRes = await axios.get(`${API_URLS.routesDistance}?from=${val1}&to=${val2}`).then(res => res.data);
              const airport1 = distRes.from;
              const airport2 = distRes.to;
  
              const airlinesFormatted = distRes.airlines.map(code => { 
                  const airlineInfo = allAirlinesMap.get(code.toUpperCase());
                  return airlineInfo ? `${airlineInfo.name} (${code})` : `${code}`;
              });
  
               htmlResult = `
                  <h2 class="text-xl font-semibold mb-2">Distance Calculation:</h2>
                  <p><b>From:</b> ${airport1.name} (${airport1.iata})</p>
                  <p><b>To:</b> ${airport2.name} (${airport2.iata})</p>
                  <p class="mt-2"><b><i class="fas fa-ruler-horizontal mr-1"></i> Distance:</b> ${distRes.distance_km} km</p>
                  ${formatList(airlinesFormatted, 'Airlines Flying This Route')}
               `;
  
              airportsData = [airport1, airport2].filter(ap => ap && ap.latitude != null && ap.longitude != null);
              if (airportsData.length === 2) {
                   routesData = [{ departure: val1, arrival: val2, airline: 'Direct Distance' }];
              }
              break;
          }
          default:
              throw new Error("Invalid search type selected.");
      }
  
      resultSection.innerHTML = htmlResult || '<p class="text-gray-600">No results found for this query.</p>';
      plotAirportsAndRoutes(airportsData, routesData, focusAirport);
  
    } catch (err) {
      console.error("Search Error:", err);
      const errorMsg = err.response?.data || err.message || "An unexpected error occurred. Please check the codes and try again.";
      displayError(errorMsg);
      clearMap();
    } finally {
      loading.classList.add('hidden');
    }
  });
  
  // --- Event Listeners ---
  searchTypeSelect.addEventListener('change', updatePlaceholders);
  
  // --- Initialization ---
  async function initializeApp() {
      loading.classList.remove('hidden');
      resultSection.innerHTML = '<p class="text-gray-500">Loading initial flight data...</p>';
      try {
          const [countriesRes, airlinesRes, airportsRes] = await Promise.all([
              axios.get(API_URLS.countries).then(res => res.data),
              axios.get(API_URLS.airlinesAll).then(res => res.data),
              axios.get(API_URLS.airportsAll).then(res => res.data)
          ]);
  
          allCountries = countriesRes;
          allAirlines = airlinesRes;
          allAirports = airportsRes;
  
          allAirportsMap.clear();
          allAirports.forEach(ap => {
              if (ap.iata) { allAirportsMap.set(ap.iata.toUpperCase(), ap); }
          });
  
          allAirlinesMap.clear();
          allAirlines.forEach(al => {
              if (al.iata) { // Use IATA as the key
                  allAirlinesMap.set(al.iata.toUpperCase(), al);
              }
              // Optionally add ICAO as fallback key if needed?
              // else if (al.icao) { allAirlinesMap.set(al.icao.toUpperCase(), al); }
          });
  
  
          console.log(`Loaded ${allCountries.length} countries, ${allAirlinesMap.size} airlines (with IATA), ${allAirportsMap.size} airports (with IATA).`);
  
          setupAutocomplete();
          updatePlaceholders();
  
          resultSection.innerHTML = '<p class="text-gray-500">Enter search criteria above and click Search.</p>';
  
      } catch (err) {
          console.error("Initialization Error:", err);
          displayError("Failed to load initial flight data. Please refresh the page.");
          searchButton.disabled = true;
          input1.disabled = true;
          input2.disabled = true;
          searchTypeSelect.disabled = true;
      } finally {
          loading.classList.add('hidden');
      }
  }
  
  // Function to setup or re-setup autocomplete
  function setupAutocomplete() {
      const type = searchTypeSelect.value;
      let source1 = () => [...allCountries, ...allAirlines, ...allAirportsMap.values()];
      let source2 = () => [...allAirportsMap.values()];
  
      switch(type) {
          case 'country': source1 = () => allCountries; break;
          case 'airline': source1 = () => allAirlines; break;
          case 'airportDetails':
          case 'from':
          case 'to':
          case 'toFrom':
          case 'between':
          case 'distance':
              source1 = () => [...allAirportsMap.values()]; break;
      }
      createCustomDropdown(input1, source1);
      createCustomDropdown(input2, source2);
  }
  
  // Start the application
  initializeApp();