# EHS cycle data decoding spec

Condensed from dwellsee.com/decoding-guide (read 2026-11-10). Samsung does not document this. It is reverse-engineered.

## Source

- SmartThings capability `samsungce.ehsCycleData`: a hex-encoded binary blob per component (outdoor unit and indoor unit).
- Indoor component is `INDOOR` (24-byte format) or `INDOOR1` (31/36-byte format).
- `samsungce.ehsTemperatureReference`: `water` (default) or `air`. This changes what `temperatureMeasurement.temperature` on INDOOR means.

## Layout selection

1. Decode by **payload length first**. Since the 2026-03-31 firmware, SAC_EHS_MONO/SPLIT send 31B indoor / 28B outdoor, so binaryId alone is not reliable.
2. Use binaryId as a hint. Unknown means fall back to length. No match means null.

| binaryId                           | Indoor                      | Outdoor | Component | Flow           |
| ---------------------------------- | --------------------------- | ------- | --------- | -------------- |
| SAC_EHS_MONO / SAC_EHS_SPLIT       | 31B (24B before 2026-03-31) | 28B     | INDOOR    | u16 BE /10     |
| SAC_DVM_HE                         | 24B                         | 18B     | INDOOR    | byte 7 integer |
| TP1X_DA_AC_EHS_01001_0000          | 31B                         | 28B     | INDOOR1   | u16 BE /10     |
| S905D3_SAC_EHS_24 (e.g. E50AJTAE1) | 36B                         | 28B     | INDOOR1   | u16 BE /10     |

## Formulas

- Temperature: `byte - 55` °C
- Frequency: int16 BE, Hz
- Pump speed: byte as %
- `0xFF` = no reading. `0x05` = null sentinel (which is also -50 °C, so treat it as null).

## Outdoor (18B or 28B, first 18 bytes shared)

| Byte  | Field                                                                     | Confidence  | NASA reg |
| ----- | ------------------------------------------------------------------------- | ----------- | -------- |
| 0–1   | compressor current freq (Hz)                                              | cross-ref   | 0x8238   |
| 2–3   | compressor target freq (Hz)                                               | cross-ref   | 0x8236/7 |
| 4     | probably condensing temp, ~15 °C below discharge. Do NOT use as discharge | unknown     |          |
| 5     | discharge gas temp (0xFF on ~20% of MONO units)                           | cross-ref   | 0x820A   |
| 6     | evaporator saturation temp                                                | statistical | ~0x8205  |
| 7     | suction temp (28B only)                                                   | statistical | ~0x8206  |
| 8     | outdoor temp                                                              | validated   | 0x8204   |
| 20–21 | NOT flow, meaning unknown. Ignore                                         |             |          |

## Indoor 24B (INDOOR)

| Byte | Field                                             | Confidence |
| ---- | ------------------------------------------------- | ---------- |
| 0    | evaporator inlet temp                             | cross-ref  |
| 1    | evaporator outlet temp                            | cross-ref  |
| 2    | return water temp                                 | cross-ref  |
| 4    | flow temp, only if reference=air and byte != 0x05 | validated  |
| 7    | flow rate, integer L/min                          | validated  |
| 8    | pump speed %                                      | validated  |

## Indoor 31B / 36B (INDOOR1, and MONO/SPLIT after 2026-03-31)

| Byte        | Field                                                                      | Confidence  |
| ----------- | -------------------------------------------------------------------------- | ----------- |
| 2           | return water temp                                                          | cross-ref   |
| 3           | flow temp                                                                  | validated   |
| 6–7         | flow rate, uint16 BE / 10 L/min. Never read byte 7 alone, it wraps at 25.5 | validated   |
| 8           | pump speed %                                                               | validated   |
| 27 (31B)    | probably DHW tank temp (redundant with the API dhwTemp)                    | unconfirmed |
| 31–35 (36B) | unknown                                                                    |             |

## Flow temperature by reference

- water: INDOOR `temperatureMeasurement.temperature` is the flow temp.
- air: that value is room temp. Flow temp is indoor byte 4 − 55 (24B), or byte 3 (31/36B).

## Data quality rules

- Discard flow > 60 L/min. Corrupt repeats arrive ×10/×100 and truncated to 16 bits (e.g. 006E → 2AF8 → ADB0, also 8000).
- System off (main switch and heating circuit off): the cycle data is stale. Force flow = 0 and treat outdoor temp as stale. After switch-on, expect one or two stale polls.
- Ignore stale data when the device clock is wrong. Compare against the receive time, not the device time.
- Fleet range for 24B flow: 13–39 L/min when heating.
