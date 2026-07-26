# CruzWatch — Project Spec

**Event:** CruzHacks "Build with Gemma: Cruz Into The Gemmaverse!" (Kaggle, 1-day virtual hackathon)
**Deadline:** Jul 26, 2026, 6:00 PM PDT
**Track(s):** Edge / On-Device (primary submission), with strong Autonomous Agent (function calling) elements
**Working name:** CruzWatch

> Note: this is a lightweight planning spec for a 1-day hackathon submission, not a production PRD. There is no existing codebase, seams, or issue tracker for this project yet — this doc is a synthesis of the brainstorming conversation, meant to guide the build and the Kaggle writeup.

## Problem Statement

People die or nearly die in the water and on cliffs along the Santa Cruz coastline with regularity, and there's no automated system watching known high-risk spots to catch trouble early and get help moving before it's too late.

This is not hypothetical to the team: two SJSU students were swept away at a Santa Cruz beach last month, a classmate from a computational models course died cliff jumping last year, and multiple surfers known personally to the team have come close to drowning. Lifeguard coverage is limited to specific beaches and hours; many of the actual incident locations (rocky coves, cliff-jump spots, unsupervised stretches) have no human watching at all, and by the time someone on shore notices something is wrong and manually calls for help, critical time has already been lost.

## Solution

CruzWatch is a proof-of-concept edge device + software system for known high-risk coastal spots: a camera (RGB + thermal) feeds a lightweight computer-vision model that watches for defined hazard triggers (entry into a restricted/dangerous zone, or — in the hackathon PoC — anomalous motion on staged/synthetic footage as a stand-in for distress detection). When a trigger fires, a Gemma 4 agent running locally reasons about the event, drafts a structured incident description, and calls a (mocked, for demo purposes) emergency-escalation API to alert responders — visualized on a live web dashboard.

For the hackathon: the software pipeline runs live and locally (on team hardware, standing in for the eventual embedded device); the physical Raspberry Pi + thermal camera + 3D-printed enclosure is presented as a hardware concept via renders and a cost breakdown, not a fabricated unit, since this is a virtual hackathon judged on writeup + code repo + demo video.

## User Stories

1. As a beach goer at an unsupervised, high-risk coastal spot, I want an automated system watching for danger, so that help can be alerted even when no lifeguard or bystander notices in time.
2. As a family member of someone at the beach, I want confidence that known hazardous spots have some form of automated monitoring, so that I worry less about unsupervised areas.
3. As a county emergency dispatcher, I want to receive a structured, specific incident alert (location, nature of the event, timestamp), so that I can respond faster and more accurately than with a vague bystander call.
4. As a lifeguard or beach safety coordinator, I want visibility into which zones are currently flagged as active/triggered on a dashboard, so that I can direct attention to the right spot immediately.
5. As a hackathon judge, I want to see a clear, working live demo of the detection-to-escalation pipeline, so that I can evaluate whether the Gemma integration is real and functional, not just claimed.
6. As a hackathon judge, I want the writeup to be honest about what's a validated capability vs. a proof-of-concept/synthetic-data illustration, so that I can trust the technical claims being made.
7. As a developer on the team, I want the CV trigger and the Gemma agent decoupled (Gemma invoked only on-trigger, not continuously), so that the system is both technically realistic on constrained edge hardware and easy to demo reliably.
8. As a developer on the team, I want a deterministic demo path (cued synthetic/staged footage), so that the live demo reliably reproduces the same result during judging instead of depending on an unpredictable live camera feed.
9. As a system operator, I want the dashboard to show the agent's reasoning/incident summary in plain language, so that a human can quickly verify the alert makes sense before/while it's escalated.
10. As a non-native-English-speaking resident or visitor, I want any spoken/dashboard alerts to be understandable across languages (stretch goal), so that the system serves the full local community.
11. As a county or parks official evaluating this concept post-hackathon, I want a clear hardware cost breakdown and deployment concept (targeted high-risk spots, not blanket coastline coverage), so that I can assess feasibility of a real pilot.
12. As a product owner, I want the system's detection claims scoped honestly (zone-entry / staged-distress PoC, not validated open-water drowning detection), so that the project doesn't overstate an unsolved CV research problem as solved.
13. As a developer, I want the emergency-escalation call to hit a mocked/test endpoint (e.g., a test webhook or sandbox SMS number), so that the demo never risks contacting real 911/fire/ambulance infrastructure.

## Implementation Decisions

- **Architecture split**: a lightweight CV model runs continuously/cheaply on the incoming video feed to watch for the defined trigger condition; Gemma 4 is invoked only when a trigger fires (event-driven), not run continuously in parallel with the CV model. This is both a realistic compute allocation for edge hardware and the core "why Gemma, why local, why now" narrative for the pitch.
- **Detection scope (hackathon PoC)**: the CV layer detects either (a) a person entering a defined high-risk/restricted zone (virtual tripwire via bounding-box/line-crossing on a pretrained person detector), or (b) anomalous motion patterns on staged/synthetic footage as an illustrative stand-in for distress detection. The system explicitly does NOT claim to reliably detect real open-water drowning — that remains an open CV research problem and is out of scope for this PoC (see Out of Scope).
- **Demo determinism**: the live/recorded demo uses staged or synthetic video (and thermal-style footage, since no real thermal camera is available) cued to trigger the pipeline reliably, rather than depending on live unpredictable camera input.
- **Gemma's role**: on trigger, Gemma 4 receives the structured event (not raw video), decides severity/urgency, drafts a structured incident description (location, nature of event, timestamp, confidence), and calls a tool to escalate.
- **Escalation endpoint**: the "contact authorities" function call targets a mocked/sandboxed endpoint only (e.g., a test webhook, a sandbox Twilio number, or a local fake dispatch console) — never a real 911/fire/ambulance system, under any circumstances.
- **Local inference**: for the hackathon, Gemma 4 runs locally on team-available hardware (laptop), satisfying the Edge/On-Device track's "runs locally" requirement without needing physical Pi hardware in hand, since the hackathon is virtual and judged on code + demo video + writeup, not physical inspection.
- **Dashboard**: a simple web dashboard displays camera/zone status, the triggered event, Gemma's generated incident summary/reasoning, and the (mocked) escalation state.
- **Hardware concept (not fabricated for this submission)**: Raspberry Pi + RGB camera + thermal camera module (e.g., FLIR Lepton-class) + weatherproof 3D-printed enclosure + solar panel/battery + cellular modem for connectivity at remote coastal spots. Presented via AI-generated concept renders and a component cost breakdown (~$500–800/unit) in the writeup, explicitly labeled as a production concept, not a built/tested unit.
- **Deployment framing**: targeted deployment at a defined set of known high-risk locations (roughly 15–20 spots), not blanket coverage of the full coastline — more honest and a better cost story.
- **Track submission**: primary submission under Edge/On-Device; writeup also highlights the Autonomous Agent (function-calling) mechanics as a secondary strength.
- **Naming**: working name CruzWatch (RipWatch considered as an alternative, more directly evoking rip currents specifically).

## Testing Decisions

- Given the 1-day hackathon scope, "testing" here primarily means verifying the live demo pipeline runs end-to-end and reproducibly, not a formal automated test suite.
- The CV trigger condition (zone-crossing threshold, or synthetic-footage cue point) should be manually verified to fire reliably and consistently before recording the demo video.
- The Gemma agent's tool-calling step (event → structured description → escalation call) should be run live and screen-recorded rather than faked/edited in post, so the recorded demo reflects a real working pipeline.
- If time allows, basic checks on the escalation call (confirm it always hits the mocked endpoint, never a placeholder for a real emergency number) are worth a quick manual review before submission, given the safety sensitivity of this project.
- No prior art in this repo/tracker to reference, since this is a new, greenfield hackathon project.

## Out of Scope

- Real open-water drowning/distress detection as a validated, production-ready CV capability — this remains an unsolved research problem and is explicitly not claimed as solved.
- Any integration with real 911, fire, ambulance, or other live emergency-dispatch systems or numbers.
- Physical fabrication/assembly of the Raspberry Pi + thermal camera + 3D-printed enclosure for this submission (presented as a concept only).
- Multi-location networked deployment/fleet management of multiple physical units.
- Production-grade false-positive/false-negative tuning, field validation, or regulatory/liability review — noted in the writeup as necessary future work for any real pilot.
- Multilingual dashboard/alert support (noted as a stretch goal, not required for the hackathon submission).
- Simultaneous real-time CV + Gemma inference on embedded/constrained hardware (mitigated by the event-driven architecture decision above, not attempted as a continuous parallel workload).

## Further Notes

- The personal, first-hand nature of the problem (team members' direct connections to recent local drowning/cliff-jumping incidents) is a core part of the pitch narrative and should be foregrounded in the writeup's problem statement.
- Judging rubric to keep in mind while building: Gemma Integration (30%), Innovation & Impact (30%), Functionality (20%), Presentation & Writeup (20%) — the writeup's honesty about PoC scope and synthetic data is expected to strengthen Presentation and reduce risk of a credibility challenge from judges, not weaken the submission.
- Submission requirements: Kaggle Writeup (≤1500 words, must select a track), attached public code repository, attached live demo or clonable notebook — all due before the Jul 26, 2026 6:00 PM PDT deadline.
