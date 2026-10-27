# Connectivity spike

## Resolved server TLS fault — current result

The site's new leaf is issued by GoGetSSL RSA DV SSL CA 2, but its supplied chain contains the older GoGetSSL RSA DV CA. The missing CA 2 certificate was obtained from the issuer AIA and its signature verified against the built-in trusted Sectigo Root R46. The official-only Edge fetcher now supplies that intermediate while retaining hostname/certificate verification.

The deployed spike then returned HTTP 200 for the list, TXT and PDF. Live discovery found six sources, 177 draws and 185 candidates. At the final recorded processing snapshot: 164 verified, 13 unresolved, 245,393 number rows, 224 finished jobs and none queued/failed. Normal server automation works with the phone closed. Native fallback still rejects the site's broken chain on this phone and is skipped when server discovery is healthy.

Rs1500 August-2026 PDF extraction was measured: 1,638,992 bytes, 75 ms extraction, only two whitespace characters. That is a scan needing OCR, not a successful readable result. A day-long reliability sample and full outage drill remain unverified.

See DEEP_DETAILED_AUDIT.md for the current findings. The observations below are chronological history and do not override this resolved server result.

## Live observations — 27 October 2026

Authenticated access to dwagvpxegvixgztmovyx is working. Eleven migrations, eight Edge Functions and four scheduler jobs were deployed. The live database test suite passed 31 assertions.

At 07:30 UTC, the deployed spike in ap-northeast-2 attempted the known Rs750 list, 105th TXT and PDF. All three failed with `invalid peer certificate: UnknownIssuer`, after approximately 938/627/629 ms. At 07:34 UTC, the www hostname and official download index failed with the same error (616/327 ms). These results establish a TLS trust-chain failure from this Edge runtime; they do not establish geographic IP blocking.

Certificate verification remains enabled. A shell certificate inspection timed out. No official result was ingested by bypassing TLS validation.

Automatic foreground Android/iOS device discovery and download fallback is now implemented, with the same server parser, SQL matcher and raw-byte provenance. It needs real-device connectivity verification. It pauses when the app closes, so it cannot yet meet the fully unattended acceptance criterion. Historical backfill and a day-long reliability sample remain outstanding.

The notes below describe earlier, pre-connection observations and are retained as history.

## Observed locally

- Target Supabase project: `dwagvpxegvixgztmovyx`.
- The public application key was subsequently provided in the local `.env` and the mobile configuration was generated. A direct authenticated API reachability probe still failed with EACCES; no private database rows were read or written.
- No callable Supabase MCP tools are exposed in this session.
- The requested read-only MCP registration was attempted. Windows denied writing `C:/Users/lenovo/.codex/config.toml` under the workspace permissions. Existing definitions refer to another project and were not changed.
- The later write-enabled MCP command was also attempted using the PowerShell CLI entry point with the complete quoted URL. It received the same filesystem denial. A Supabase integration was found through the available plugin directory and suggested; installation/OAuth has not been confirmed.
- Shell outbound network requests are restricted. Online npm requests failed with EACCES; original dependencies were successfully installed from local cache.
- A web fetch of `https://savings.gov.pk/download-draws/` timed out. This is not evidence about connectivity from Supabase Edge or a Pakistani device.
- Docker is installed but its daemon is not running, so local Supabase integration tests cannot currently run.

## Decision still required from measurements

No architecture A/B/hybrid claim has been made. Deploy `connectivity-spike` and call it repeatedly over a day, including a known TXT and PDF from the supplied corpus. Record each response with its location, timestamp, HTTP status, latency, content type and body preview. Until those results exist, the application must display incomplete/unreachable status instead of claiming the automatic pipeline is healthy.

The implementation includes server fetching and a native-device upload path, so the measured result can select the fetcher without changing parsing or SQL matching. OCR and optional official-search confirmation must remain visibly pending when unavailable.
