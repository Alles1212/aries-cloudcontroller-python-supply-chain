# Aries CloudController Python — SSI Supply Chain Demo

A Self-Sovereign Identity (SSI) supply chain demo built with **Hyperledger Aries**, **Aries Cloud Agent - Python (ACA-Py)**, **aries-cloudcontroller-python**, and **VON Network**. This repository implements a three-party flow: **Faber** (Issuer), **Alice** (Holder), and **Acme** (Verifier), with type-safe Python controllers using FastAPI and the aries-cloudcontroller client.

---

## Table of Contents

- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Supply Chain Roles: Issuer, Holder, Verifier](#supply-chain-roles-issuer-holder-verifier)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Usage & Workflow](#usage--workflow)
- [Guidelines](#guidelines)
- [API Endpoints](#api-endpoints)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [References](#references)

---

## Technology Stack

| Component | Description |
|-----------|-------------|
| **Hyperledger Aries** | Framework for decentralized identity and verifiable credentials (DIDComm, protocols). |
| **ACA-Py** | Aries Cloud Agent - Python; implements Aries protocols and talks to the ledger. |
| **aries-cloudcontroller-python** | Type-safe Python client for ACA-Py Admin API (OpenAPI-generated). |
| **VON Network** | Verifiable Organizations Network; Indy-based ledger for schemas and credential definitions. |
| **FastAPI** | Web framework for the three controllers (Faber, Alice, Acme). |
| **React (Vite)** | Frontend for each controller. |

---

## System Architecture

High-level architecture: Controllers use aries-cloudcontroller-python to call ACA-Py agents; agents use the Indy ledger (VON Network) for schemas and credential definitions.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           User / Browser (React UI)                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ Faber Controller│  │ Alice Controller│  │ Acme Controller  │                 │
│  │   (Issuer UI)   │  │  (Holder UI)    │  │ (Verifier UI)    │                 │
│  │   :9021         │  │   :9031         │  │   :9041         │                 │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘                 │
└────────────┼───────────────────┼─────────────────────┼──────────────────────────┘
             │                   │                     │
             │    aries-cloudcontroller-python          │
             │    (typed client → ACA-Py Admin API)     │
             │                   │                     │
┌────────────▼───────────────────▼─────────────────────▼──────────────────────────┐
│                         Python Controllers (FastAPI)                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ Faber           │  │ Alice           │  │ Acme            │                 │
│  │ routes:         │  │ routes:         │  │ routes:         │                 │
│  │ connections,    │  │ connections,    │  │ connections,    │                 │
│  │ schemas,        │  │ credentials,    │  │ credentials,    │                 │
│  │ cred defs,      │  │ proofs          │  │ schemas,        │                 │
│  │ credentials     │  │                 │  │ cred defs,      │                 │
│  └────────┬────────┘  └────────┬────────┘  │ proofs          │                 │
│           │                   │            └────────┬────────┘                 │
└───────────┼───────────────────┼─────────────────────┼──────────────────────────┘
            │                   │                     │
            │         ACA-Py Admin API (HTTP)        │
            │                   │                     │
┌───────────▼───────────────────▼─────────────────────▼──────────────────────────┐
│                      Aries Cloud Agent - Python (ACA-Py)                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ Faber Agent     │  │ Alice Agent     │  │ Acme Agent      │                 │
│  │ :8120 (admin)   │  │ :8030 (admin)   │  │ :8040 (admin)   │                 │
│  │ DIDComm,        │  │ DIDComm,        │  │ DIDComm,        │                 │
│  │ Issue Cred v2   │  │ Hold credentials│  │ Request/Verify  │                 │
│  │ Publish Schema  │  │ Present Proof   │  │ Proof           │                 │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘                 │
└───────────┼───────────────────┼─────────────────────┼──────────────────────────┘
            │                   │                     │
            │    Indy Protocol (read/write ledger)    │
            │                   │                     │
┌───────────▼───────────────────▼─────────────────────▼──────────────────────────┐
│                         VON Network (Indy Ledger)                               │
│  http://localhost:9000                                                          │
│  • Schemas (write by Issuer)                                                    │
│  • Credential Definitions (write by Issuer)                                     │
│  • Ledger explorer UI                                                           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

Data flow summary:

1. **Browser** → **Controller** (FastAPI): REST API and static React app.
2. **Controller** → **ACA-Py**: aries-cloudcontroller-python calls Agent Admin API.
3. **ACA-Py** ↔ **VON Network**: read/write schemas, credential definitions; DID and key material.

---

## Supply Chain Roles: Issuer, Holder, Verifier

In this demo, the three roles map to a simple supply chain: Issuer (Faber) issues credentials, Holder (Alice) stores and presents them, Verifier (Acme) requests and verifies proofs.

```
                    ┌──────────────────────────────────────────────────────────┐
                    │              SSI Supply Chain (Aries Flow)                 │
                    └──────────────────────────────────────────────────────────┘

     ┌─────────────────────┐         ┌─────────────────────┐         ┌─────────────────────┐
     │       FABER         │         │       ALICE         │         │       ACME          │
     │      (Issuer)       │         │      (Holder)       │         │     (Verifier)       │
     ├─────────────────────┤         ├─────────────────────┤         ├─────────────────────┤
     │ • Create Schema     │         │ • Store credentials │         │ • Request proof     │
     │ • Create Cred Def   │         │ • Present proof     │         │ • Verify proof      │
     │ • Issue credentials │         │ • Manage connections│         │ • View schemas/     │
     │ • Revoke (optional) │         │                     │         │   cred defs (read)  │
     │ • Manage connections│         │                     │         │ • Manage connections│
     └──────────┬──────────┘         └──────────┬──────────┘         └──────────┬──────────┘
                │                               │                               │
                │  1. Connection (OOB invite)   │  2. Connection (OOB invite)   │
                │─────────────────────────────►│◄─────────────────────────────►│
                │                               │                               │
                │  3. Issue credential          │  4. Present proof              │
                │     (offer → request →        │     (request → presentation   │
                │      issue)                   │      → verify)                 │
                │─────────────────────────────►│───────────────────────────────►│
                │                               │                               │
                │  Ledger: Schema, Cred Def     │  Ledger: read-only            │
                │  (Faber writes)               │  (Alice does not write)       │
                ▼                               ▼                               ▼
     ┌─────────────────────────────────────────────────────────────────────────────────┐
     │                          VON Network (Indy Ledger)                               │
     │  Schemas, Credential Definitions, DIDs                                          │
     └─────────────────────────────────────────────────────────────────────────────────┘
```

| Role    | Party | Responsibility |
|---------|-------|----------------|
| Issuer  | Faber | Publish schemas and credential definitions to the ledger; issue credentials to Alice. |
| Holder  | Alice | Receive and store credentials; present proofs to Acme when requested. |
| Verifier| Acme  | Send proof requests; verify presentations (and optionally read schemas/cred defs from ledger). |

---

## Prerequisites

- **Docker** and **Docker Compose**
- **VON Network** (Indy ledger) running, e.g. at `http://localhost:9000`

To start VON Network (if not already running):

```bash
git clone https://github.com/bcgov/von-network.git
cd von-network
./manage build
./manage start
# Ledger UI: http://localhost:9000
```

---

## Quick Start

1. **Set ledger URL** (if not using default):

   ```bash
   export LEDGER_URL="http://host.docker.internal:9000"
   export GENESIS_URL="${LEDGER_URL}/genesis"
   ```

2. **Start all services** (agents + controllers):

   ```bash
   ./run_demo start
   # Or with logs: ./run_demo start --logs
   ```

3. **Verify**:

   ```bash
   curl -s http://localhost:9021/api/status   # Faber
   curl -s http://localhost:9031/api/status   # Alice
   curl -s http://localhost:9041/api/status   # Acme
   # Each should return: {"status":"up"}
   ```

4. **Open UIs**:

   - Faber Controller (Issuer): http://localhost:9021  
   - Alice Controller (Holder): http://localhost:9031  
   - Acme Controller (Verifier): http://localhost:9041  

   Agent Admin (Swagger) optional:

   - Faber Agent: http://localhost:8120  
   - Alice Agent: http://localhost:8030  
   - Acme Agent: http://localhost:8040  

---

## Usage & Workflow

### 1. Faber ↔ Alice: connection

1. **Faber** (http://localhost:9021): Connections → **Create Invitation** → copy the invitation JSON.
2. **Alice** (http://localhost:9031): Connections → **Accept Invitation** → paste JSON → submit.
3. On both UIs, the connection should show as **active**.

### 2. Faber issues a credential to Alice

1. **Faber**: Ensure a schema and credential definition exist (Schemas → Create Schema if needed; Credential Definitions lists cred defs).
2. **Faber**: Credential Definitions → **Send Credential** → choose Alice’s connection → fill attributes → send.
3. **Alice**: Credentials → see the new credential exchange; accept/store as needed.

### 3. Alice ↔ Acme: connection

1. **Alice**: Connections → Create Invitation → copy JSON.
2. **Acme** (http://localhost:9041): Connections → Accept Invitation → paste JSON → submit.
3. Both sides should show the connection as **active**.

### 4. Acme requests proof, Alice presents

1. **Acme**: Proofs → **Send Proof Request** → choose Alice’s connection → enter Credential Definition ID (from Faber’s Credential Definitions) → optionally add predicates (e.g. range proof) → send.
2. **Alice**: Proofs → see the request → **Send Proof** (choose credential and send presentation).
3. **Acme**: Proofs → verify the presentation; status should become **verified**.

---

## Guidelines

- **Ledger**: Ensure VON Network is up and reachable at `LEDGER_URL` (e.g. `http://host.docker.internal:9000` from containers).
- **Ports**: Avoid conflicts with 9021, 9031, 9041 (controllers) and 8120, 8030, 8040 (agents); 9000 for VON.
- **Credentials**: Issuer (Faber) must have a schema and credential definition on the ledger before issuing; Verifier (Acme) needs the correct Credential Definition ID when sending proof requests.
- **Predicates**: For range proofs (e.g. age ≥ 18), use numeric attribute names and values; predicates are sent in the proof request and verified by Acme.
- **Revocation**: Supported only if the credential definition was created with `support_revocation: true`; use the revoke endpoint with `rev_reg_id` and `cred_rev_id`.

---

## API Endpoints

Base URLs (host):

- Faber Controller: `http://localhost:9021`
- Alice Controller: `http://localhost:9031`
- Acme Controller: `http://localhost:9041`

All controller routes below are prefixed with `/api` (e.g. Faber: `http://localhost:9021/api/...`).

---

### Faber Controller (Issuer)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Controller/agent health. |
| GET | `/api/connections` | List connections. |
| POST | `/api/connections/invitation` | Create out-of-band invitation. |
| POST | `/api/connections/accept` | Accept invitation (body: invitation JSON). |
| DELETE | `/api/connections/{connection_id}` | Remove connection. |
| GET | `/api/schemas` | List created schema IDs. |
| GET | `/api/schemas/{schema_id}` | Get schema by ID (path). |
| POST | `/api/admin/schema` | Create schema and credential definition (body: schema_name, schema_version, attributes, tag, support_revocation). |
| GET | `/api/credential-definitions` | List created credential definition IDs. |
| GET | `/api/credential-definitions/{cred_def_id}` | Get credential definition by ID (path). |
| POST | `/api/credentials/send` | Send credential offer (body: connection_id, cred_def_id, attributes, etc.). |
| GET | `/api/credential-exchanges` | List credential exchange records. |
| POST | `/api/credentials/revoke` | Revoke credential (body: cred_ex_id, rev_reg_id, cred_rev_id, publish). |

---

### Alice Controller (Holder)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Controller/agent health. |
| GET | `/api/connections` | List connections. |
| POST | `/api/connections/invitation` | Create invitation. |
| POST | `/api/connections/accept` | Accept invitation. |
| DELETE | `/api/connections/{connection_id}` | Remove connection. |
| GET | `/api/credentials` | List stored credentials. |
| GET | `/api/credential-exchanges` | List credential exchange records. |
| POST | `/api/credential-exchanges/{cred_ex_id}/request` | Send credential request (after offer). |
| POST | `/api/credential-exchanges/{cred_ex_id}/store` | Store issued credential. |
| GET | `/api/proofs` | List proof exchange records. |
| POST | `/api/proofs/{pres_ex_id}/send` | Send presentation (respond to proof request). |
| GET | `/api/proofs/{pres_ex_id}/credentials` | Get credentials available for a proof request. |

---

### Acme Controller (Verifier)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Controller/agent health. |
| GET | `/api/connections` | List connections. |
| POST | `/api/connections/invitation` | Create invitation. |
| POST | `/api/connections/accept` | Accept invitation. |
| DELETE | `/api/connections/{connection_id}` | Remove connection. |
| GET | `/api/credentials` | List stored credentials (if any). |
| GET | `/api/credential-exchanges` | List credential exchange records. |
| GET | `/api/schemas` | List schema IDs (from ledger). |
| GET | `/api/schemas/{schema_id}` | Get schema by ID (path). |
| GET | `/api/credential-definitions` | List credential definition IDs. |
| GET | `/api/credential-definitions/{cred_def_id}` | Get credential definition by ID (path). |
| GET | `/api/proofs` | List proof exchange records. |
| POST | `/api/proofs/send-request` | Send proof request (body: connection_id, presentation_request with indy request, optional comment). |
| POST | `/api/proofs/{pres_ex_id}/verify` | Verify presentation. |
| GET | `/api/proofs/{pres_ex_id}` | Get proof exchange by ID. |

---

## Project Structure

```
.
├── faber-controller-python/     # Issuer controller
│   ├── main.py
│   ├── config.py
│   ├── routes/
│   │   ├── connections.py
│   │   ├── schemas.py
│   │   ├── credential_definitions.py
│   │   └── credentials.py
│   ├── client/                  # React (Vite) UI
│   └── requirements.txt
├── alice-controller-python/     # Holder controller
│   ├── main.py
│   ├── config.py
│   ├── routes/
│   │   ├── connections.py
│   │   ├── credentials.py
│   │   └── proofs.py
│   ├── client/
│   └── requirements.txt
├── acme-controller-python/      # Verifier controller
│   ├── main.py
│   ├── config.py
│   ├── routes/
│   │   ├── connections.py
│   │   ├── credentials.py
│   │   ├── schemas.py
│   │   ├── credential_definitions.py
│   │   └── proofs.py
│   ├── client/
│   └── requirements.txt
├── aries_cloudcontroller/       # aries-cloudcontroller-python client
├── docker-compose.yml
├── run_demo                     # Start/stop script
└── README.md
```

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| Agent cannot reach ledger | Ensure VON Network is running at `LEDGER_URL`; from host use `http://localhost:9000`, from containers use `http://host.docker.internal:9000`. |
| Controller returns `{"status":"down"}` | Confirm the corresponding agent container is up; check `docker-compose ps` and agent logs. |
| Credential or proof flow fails | Verify connections are **active** on both sides; confirm schema and credential definition exist on the ledger and Credential Definition ID is correct for proof requests. |
| Port already in use | Change controller/agent port mapping in `docker-compose.yml` or stop the conflicting process. |

Useful commands:

```bash
docker-compose ps
docker-compose logs faber-controller
docker-compose logs faber-agent
./run_demo stop
./run_demo start
```

---

## References

- [Hyperledger Aries](https://www.hyperledger.org/use/aries)
- [Aries Cloud Agent - Python (ACA-Py)](https://aca-py.org/)
- [aries-cloudcontroller-python](https://github.com/didx-xyz/aries-cloudcontroller-python)
- [VON Network](https://github.com/bcgov/von-network)
- [Indy Ledger](https://wiki.hyperledger.org/display/indy)

---

## License

Apache-2.0
