# Nirvana HP API Reverse Engineering Findings

Extracted from APK v2.9.6 (com.ideoconcepts.nirvanaApp) — Nuxt.js + Capacitor app.

## API Base URL
```
https://nirvana.iot-endpoint.com
```

## Authentication — AWS Cognito
- **Region:** `us-east-2`
- **UserPoolId:** `us-east-2_zqlraOyU4`
- **UserPoolWebClientId:** `3nducehok3t5n23fa76gfj6ulh`
- **Auth flow:** `USER_PASSWORD_AUTH`
- **Token:** `Authorization: Bearer {accessToken}` (JWT, refreshed automatically)

Sign in with username (email) + password via Cognito SRP. Use `amazon-cognito-identity-js` or `@aws-sdk/client-cognito-identity-provider`.

## Key Concepts
- **`card_id`** — device identifier, obtained from `GET /customer/devices`
- All control POSTs require `card_id` in body
- All GET queries accept `card_id` as query param

## Endpoints

### Account / Device
| Method | Path | Body / Params | Description |
|--------|------|---------------|-------------|
| GET | `/customer/devices` | — | List enrolled devices (get `card_id`) |
| GET | `/customer/get-history` | `?card_id=` | Alert + error history |
| GET | `/customer/clear-alerts` | `?card_id=` | Clear alert history |
| GET | `/customer/clear-errors` | `?card_id=` | Clear error history |

### Status / Parameters
| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/pump/parameter` | `{card_id, params: [...]}` | Get current device state |

**Key params to request:**
```json
["WATER_TEMPERATURE", "OUTDOOR_TEMP", "WATER_OUT_TEMP", "DELTA_TEMP",
 "HEAT_MODE", "PUMP_MODE", "FAN_MODE", "HEATING",
 "DESIRED_POOL_TEMPERATURE", "DESIRED_SPA_TEMPERATURE",
 "RUNNING_TIME", "TEMPERATURE_UNIT",
 "WATER_PUMP", "WATER_PUMP_DISABLE", "HEATING_TIMER",
 "ALERT_LIST", "ERROR_LIST", "LAST_UPDATE", "LAST_CONNECT"]
```

### Control
| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/pump/desired/heating-mode` | `{card_id, value}` | **Turn on/off / set mode** |
| POST | `/pump/desired/setpoint` | `{card_id, mode, value}` | Set target temp |
| POST | `/pump/desired/fan-mode` | `{card_id, value}` | Set fan mode |
| POST | `/pump/desired/pump-mode` | `{card_id, value}` | Set pump mode |
| POST | `/pump/desired/heating-timer` | `{card_id, value}` | Timer on/off |
| POST | `/pump/desired/heating-time-start` | `{card_id, value}` | Timer start time |
| POST | `/pump/desired/heating-time-stop` | `{card_id, value}` | Timer stop time |
| POST | `/pump/desired/water-pump-timer` | `{card_id, value}` | Water pump timer |
| POST | `/pump/desired/water-pump-disable` | `{card_id, value}` | Disable water pump |
| POST | `/pump/desired/reset-running-time` | `{card_id}` | Reset runtime counter |

## Valid Values

### HEAT_MODE (turn on/off)
- `"POOL"` — Pool heating mode (on, pool)
- `"SPA"` — Spa heating mode (on, spa)
- `"OFF"` — Turn off

### PUMP_MODE
- `"HEAT"` — Heating
- `"COOL"` — Cooling (if ALLOW_COOLING=ON)

### FAN_MODE
- `"ECO"` — Eco (quiet, energy saving)
- `"QUIET"` — Quiet
- `"SMART"` — Smart
- `"BOOST"` — Boost (max power, if ALLOW_BOOST=ON)

### SET_TEMP mode param
- `"pool"` — Pool setpoint
- `"spa"` — Spa setpoint

### ON/OFF params (timers, locks, etc.)
- `"ON"` or `"OFF"` (uppercase)

## MCP Tools to Implement

1. **`get_status`** — POST /pump/parameter, return water temp, target temp, mode, heating state, outdoor temp, runtime
2. **`set_temperature`** — POST /pump/desired/setpoint `{card_id, mode: "pool"|"spa", value: number}`
3. **`set_mode`** — POST /pump/desired/heating-mode `{card_id, value: "POOL"|"SPA"|"OFF"}`
4. **`get_history`** — GET /customer/get-history `?card_id=`
5. **`get_runtime`** — GET RUNNING_TIME via /pump/parameter
