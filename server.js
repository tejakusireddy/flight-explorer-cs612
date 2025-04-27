"use strict";

require('dotenv').config();

const express = require("express");
const { Pool } = require("pg");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 8001; // Allow configuring port via env too

// Use Environment Variables for DB Connection
// Reads from process.env, provides sensible defaults only if env var is MISSING
const pool = new Pool({
  user: process.env.PG_USER || "postgres",
  password: process.env.PG_PASSWORD, // *** REMOVED default password here - MUST be set in .env ***
  host: process.env.PG_HOST || "localhost",
  database: process.env.PG_DATABASE || "CS612_HW",
  port: parseInt(process.env.PG_PORT || "5432", 10) // Ensure port is an integer
});

// Check if the database can be reached on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('------------------------------------------------------------');
    console.error('!!! DATABASE CONNECTION FAILED !!!');
    console.error('------------------------------------------------------------');
    console.error('ERROR DETAILS:', err.stack);
    console.error('\n>>> Please check the following:');
    console.error('    1. Is the PostgreSQL server running?');
    console.error('    2. Are the database credentials in the `.env` file correct?');
    console.error('       (Needed: PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT)');
    console.error('    3. Does the database and user exist with the correct permissions?');
    console.error('------------------------------------------------------------');
    process.exit(1); // Exit if database connection fails
  } else {
    console.log('Database connection successful.');
    release(); // Release the client back to the pool
  }
});


app.use(express.static(__dirname));
app.use(express.json());

// Health Check
app.get("/", (req, res) => {
  res.send("Flight Explorer API running locally ✅");
});

// ========= Airlines Endpoints =========
app.get('/airlines', async (req, res) => {
  const { iata, icao, country_code } = req.query;
  let client;
  try {
    client = await pool.connect(); // pool.connect() uses the configured details
    if (iata) {
      const result = await client.query("SELECT * FROM airlines WHERE iata=$1", [iata.toUpperCase()]);
      return res.json(result.rows[0] || {});
    } else if (icao) {
      const result = await client.query("SELECT * FROM airlines WHERE icao=$1", [icao.toUpperCase()]);
      return res.json(result.rows[0] || {});
    } else if (country_code) {
      const result = await client.query(`
        SELECT a.name, a.iata, a.icao, a.callsign, a.country
        FROM airlines a
        JOIN countries c ON a.country = c.name
        WHERE c.code = $1
      `, [country_code.toUpperCase()]);
      return res.json(result.rows);
    } else {
      res.status(400).send("Provide 'iata', 'icao', or 'country_code'");
    }
  } catch (err) {
    console.error("GET /airlines error:", err.message);
    res.status(500).send("Error retrieving airlines");
  } finally {
    if (client) client.release();
  }
});

app.get('/airlines/all', async (req, res) => {
    let client;
    try {
      client = await pool.connect();
      const result = await client.query("SELECT name, iata, icao, country FROM airlines WHERE iata IS NOT NULL AND iata != ''");
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching all airlines", err);
      res.status(500).send("Error fetching airlines");
    } finally {
      if (client) client.release();
    }
});


// ========= Airports Endpoints =========
app.get('/airports', async (req, res) => {
    const { iata, icao, country_code } = req.query;
    let client;
    try {
      client = await pool.connect();
      if (iata) {
        const result = await client.query("SELECT * FROM airports WHERE iata=$1", [iata.toUpperCase()]);
        const airport = result.rows[0];
        if (!airport) return res.status(404).send("Airport not found");

        // Weather API
        try {
          if (airport.latitude && airport.longitude) {
            const weatherRes = await axios.get(
              `https://api.open-meteo.com/v1/forecast?latitude=${airport.latitude}&longitude=${airport.longitude}&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
            );
            if (weatherRes.data?.daily?.temperature_2m_max?.length > 0 && weatherRes.data.daily.temperature_2m_min?.length > 0) {
               airport.weather = { high: weatherRes.data.daily.temperature_2m_max[0], low: weatherRes.data.daily.temperature_2m_min[0], unit: "C" };
            } else { airport.weather = null; }
          } else { airport.weather = null; }
        } catch (weatherErr) {
          console.error(`Weather API error for ${iata}:`, weatherErr.message);
          airport.weather = null;
        }
        return res.json(airport);

      } else if (icao) {
        const result = await client.query("SELECT * FROM airports WHERE icao=$1", [icao.toUpperCase()]);
        return res.json(result.rows[0] || {});
      } else if (country_code) {
        const result = await client.query(`
          SELECT a.name, a.city, a.country, a.iata, a.icao, a.latitude, a.longitude
          FROM airports a
          JOIN countries c ON a.country = c.name
          WHERE c.code = $1 AND a.iata IS NOT NULL AND a.iata != ''
        `, [country_code.toUpperCase()]);
        return res.json(result.rows);
      } else {
        res.status(400).send("Provide 'iata', 'icao', or 'country_code'");
      }
    } catch (err) {
      console.error("GET /airports error:", err.message);
      res.status(500).send("Error retrieving airports");
    } finally {
      if (client) client.release();
    }
});

app.get('/airports/all', async (req, res) => {
    let client;
    try {
      client = await pool.connect();
      const result = await client.query(`
        SELECT name, iata, icao, city, country, latitude, longitude
        FROM airports
        WHERE iata IS NOT NULL AND iata != ''
          AND latitude IS NOT NULL AND longitude IS NOT NULL
      `);
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching all airports", err);
      res.status(500).send("Error fetching airports");
    } finally {
      if (client) client.release();
    }
});


// ========= Routes Endpoints =========
app.get('/routes', async (req, res) => {
    const { airline, aircraft, departure, arrival } = req.query;
    let client;
    try {
      client = await pool.connect();

      if (airline && !aircraft && !departure && !arrival) {
          const result = await client.query("SELECT * FROM routes WHERE airline=$1", [airline.toUpperCase()]);
          return res.json(result.rows);
      } else if (airline && aircraft && !departure && !arrival) {
        const result = await client.query("SELECT * FROM routes WHERE airline=$1 AND planes LIKE $2", [airline.toUpperCase(), `%${aircraft.toUpperCase()}%`]);
        return res.json(result.rows);
      } else if (departure && arrival && !airline && !aircraft) {
        const result = await client.query("SELECT * FROM routes WHERE departure=$1 AND arrival=$2", [departure.toUpperCase(), arrival.toUpperCase()]);
        return res.json(result.rows);
      } else if (departure && arrival && airline && !aircraft) {
          const result = await client.query("SELECT * FROM routes WHERE departure=$1 AND arrival=$2 AND airline=$3", [departure.toUpperCase(), arrival.toUpperCase(), airline.toUpperCase()]);
          return res.json(result.rows);
      } else {
        res.status(400).send("Invalid combination. Provide: 'airline' OR 'airline'+'aircraft' OR 'departure'+'arrival' OR 'departure'+'arrival'+'airline'");
      }
    } catch (err) {
      console.error("GET /routes error:", err.message);
      res.status(500).send("Error retrieving routes");
    } finally {
      if (client) client.release();
    }
});

app.get('/routes/from', async (req, res) => {
    const { departure } = req.query;
    if (!departure) return res.status(400).send('Missing departure IATA code');
    let client;
    try {
      client = await pool.connect();
      const result = await client.query('SELECT * FROM routes WHERE departure=$1', [departure.toUpperCase()]);
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching routes from departure', err);
      res.status(500).send('Error fetching departure routes');
    } finally {
      if (client) client.release();
    }
});

app.get('/routes/to', async (req, res) => {
    const { arrival } = req.query;
    if (!arrival) return res.status(400).send('Missing arrival IATA code');
    let client;
    try {
      client = await pool.connect();
      const result = await client.query('SELECT * FROM routes WHERE arrival=$1', [arrival.toUpperCase()]);
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching routes to arrival', err);
      res.status(500).send('Error fetching arrival routes');
    } finally {
      if (client) client.release();
    }
});

function haversineDistance(lat1, lon1, lat2, lon2) {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) { return null; }
    const R = 6378; // km
    const toRad = (deg) => deg * (Math.PI / 180);
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    lat1 = toRad(lat1); lat2 = toRad(lat2);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    if (a >= 1) return 0;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c);
}

app.get('/routes/distance', async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).send("Provide 'from' and 'to' IATA codes");
    if (from.toUpperCase() === to.toUpperCase()) return res.status(400).send("'from' and 'to' airports cannot be the same");

    let client;
    try {
      client = await pool.connect();
      const depRes = await client.query("SELECT name, latitude, longitude FROM airports WHERE iata=$1", [from.toUpperCase()]);
      const arrRes = await client.query("SELECT name, latitude, longitude FROM airports WHERE iata=$1", [to.toUpperCase()]);

      if (depRes.rowCount === 0) return res.status(404).send(`Departure airport ${from.toUpperCase()} not found or lacks coordinates.`);
      if (arrRes.rowCount === 0) return res.status(404).send(`Arrival airport ${to.toUpperCase()} not found or lacks coordinates.`);

      const dep = depRes.rows[0];
      const arr = arrRes.rows[0];
      const distance = haversineDistance(dep.latitude, dep.longitude, arr.latitude, arr.longitude);
      if (distance === null) { return res.status(500).send(`Could not calculate distance due to missing coordinates.`); }

      const flights = await client.query("SELECT DISTINCT airline FROM routes WHERE departure=$1 AND arrival=$2", [from.toUpperCase(), to.toUpperCase()]);

      res.json({
          from: { iata: from.toUpperCase(), name: dep.name, latitude: dep.latitude, longitude: dep.longitude },
          to: { iata: to.toUpperCase(), name: arr.name, latitude: arr.latitude, longitude: arr.longitude },
          distance_km: parseFloat(distance.toFixed(2)),
          airlines: flights.rows.map(r => r.airline)
      });
    } catch (err) {
      console.error('Error calculating distance', err);
      res.status(500).send('Error calculating distance or finding routes');
    } finally {
      if (client) client.release();
    }
});


// ========= Countries Endpoint =========
app.get('/countries', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT name, code FROM countries ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching countries', err);
        res.status(500).send('Error fetching countries');
    } finally {
        if (client) client.release();
    }
});

// ========= Start Server =========
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Flight Explorer API running at http://localhost:${PORT}`);
});