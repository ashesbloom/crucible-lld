/**
 * Three prior attempts for the demo learner.
 *
 * A reviewer arriving at an empty history page sees a list with nothing in it
 * and learns nothing about the part of the product that matters most. These
 * three are written as one learner getting better at some things and staying bad
 * at one, because that is the pattern the history page exists to surface: the
 * recurring weakness here is Reasoning Quality, and it stays weak on purpose.
 *
 * They go through the real service and the real worker. Nothing is written
 * straight to the database, so if the seeded history renders, the loop works.
 */

import { PracticeService } from "@/application/PracticeService";
import { EvaluationWorker } from "@/application/EvaluationWorker";
import { container } from "@/application/container";
import type { DesignDocumentInput } from "@/domain/design/DesignDocument";
import type { ChangeTestResponse } from "@/domain/evaluation/BlastRadius";

interface SeedAttempt {
  slug: string;
  design: DesignDocumentInput;
  changeTest: (design: DesignDocumentInput) => ChangeTestResponse;
}

/** Everything untouched except the named ids, which are marked as edited. */
function impacts(design: DesignDocumentInput, modified: string[]): ChangeTestResponse["impacts"] {
  return (design.entities ?? []).map((entity) => ({
    entityId: entity.id,
    verdict: modified.includes(entity.id) ? ("MODIFIED" as const) : ("UNCHANGED" as const),
    rationale: modified.includes(entity.id) ? "This one has to open." : "Untouched by the new rule.",
  }));
}

const ATTEMPTS: readonly SeedAttempt[] = [
  // First go. Nouns only: no interfaces, no relationships worth the name, no
  // decisions. The change lands everywhere.
  {
    slug: "parking-lot",
    design: {
      assumptions: [],
      entities: [
        { id: "lot", name: "ParkingLot", stereotype: "ENTITY", responsibility: "Runs the car park.", attributes: ["spots"], methods: ["park()", "unpark()", "calculateFee()", "findSpot()", "report()"] },
        { id: "spot", name: "Spot", stereotype: "ENTITY", responsibility: "", attributes: ["size", "free"], methods: [] },
        { id: "car", name: "Car", stereotype: "ENTITY", responsibility: "A car.", attributes: ["plate"], methods: [] },
        { id: "ticket", name: "Ticket", stereotype: "ENTITY", responsibility: "", attributes: ["time"], methods: [] },
      ],
      relations: [{ fromId: "lot", toId: "spot", kind: "HAS_A" }],
      decisions: [],
    },
    changeTest: (design) => ({
      narrative: "The fee code is inside ParkingLot so I have to change it there.",
      impacts: impacts(design, ["lot", "spot", "ticket"]),
      newEntities: [],
    }),
  },

  // Second. An interface appears, responsibilities are written, relationships
  // are recorded. Still no decisions.
  {
    slug: "vending-machine",
    design: {
      assumptions: ["One transaction at a time"],
      entities: [
        { id: "machine", name: "VendingMachine", stereotype: "ENTITY", responsibility: "Holds stock and runs a purchase.", attributes: ["slots"], methods: ["select()", "dispense()", "cancel()"] },
        { id: "slot", name: "Slot", stereotype: "ENTITY", responsibility: "Holds one product and its count.", attributes: ["product", "count"], methods: ["take()"] },
        { id: "product", name: "Product", stereotype: "VALUE_OBJECT", responsibility: "A thing for sale and its price.", attributes: ["name", "price"], methods: [] },
        { id: "purse", name: "CoinPurse", stereotype: "ENTITY", responsibility: "Holds coins and makes change.", attributes: ["coins"], methods: ["insert()", "changeFor()"] },
        { id: "state", name: "MachineState", stereotype: "INTERFACE", responsibility: "What the machine will accept right now.", attributes: [], methods: ["select()", "cancel()"] },
        { id: "idle", name: "IdleState", stereotype: "STRATEGY", responsibility: "Waiting for a customer.", attributes: [], methods: ["select()", "cancel()"] },
      ],
      relations: [
        { fromId: "machine", toId: "slot", kind: "HAS_A" },
        { fromId: "slot", toId: "product", kind: "HAS_A" },
        { fromId: "machine", toId: "purse", kind: "USES" },
        { fromId: "machine", toId: "state", kind: "USES" },
        { fromId: "idle", toId: "state", kind: "IMPLEMENTS" },
      ],
      decisions: [],
    },
    changeTest: (design) => ({
      narrative: "Card payment does not fit CoinPurse, so the machine has to know about both.",
      impacts: impacts(design, ["machine", "purse"]),
      newEntities: [
        { id: "card", name: "CardReader", stereotype: "SERVICE", responsibility: "Authorises and captures a card payment.", attributes: [], methods: ["authorise()", "capture()"] },
      ],
    }),
  },

  // Third. A real strategy, the change lands cleanly. Decisions are recorded but
  // still name no rejected alternative, which is why Reasoning stays the weak one.
  {
    slug: "elevator-system",
    design: {
      assumptions: ["Cars cannot pass each other", "All cars serve all floors initially"],
      entities: [
        { id: "bank", name: "ElevatorBank", stereotype: "ENTITY", responsibility: "Holds the cars and routes calls to them.", attributes: ["cars"], methods: ["call()"] },
        { id: "car", name: "ElevatorCar", stereotype: "ENTITY", responsibility: "Moves between floors and serves the requests it accepted.", attributes: ["floor", "direction"], methods: ["accept()", "step()"] },
        { id: "request", name: "Request", stereotype: "VALUE_OBJECT", responsibility: "A floor and a direction someone asked for.", attributes: ["floor", "direction"], methods: [] },
        { id: "dispatch", name: "DispatchPolicy", stereotype: "INTERFACE", responsibility: "Chooses which car answers a call.", attributes: [], methods: ["selectCar(request, cars)"] },
        { id: "nearest", name: "NearestCarPolicy", stereotype: "STRATEGY", responsibility: "Picks the closest car already heading that way.", attributes: [], methods: ["selectCar(request, cars)"] },
        { id: "doors", name: "DoorController", stereotype: "SERVICE", responsibility: "Opens and closes doors, and refuses to while moving.", attributes: [], methods: ["open()", "close()"] },
        { id: "range", name: "ServiceRange", stereotype: "VALUE_OBJECT", responsibility: "Which floors a car is allowed to serve.", attributes: ["floors"], methods: ["serves(floor)"] },
      ],
      relations: [
        { fromId: "bank", toId: "car", kind: "HAS_A" },
        { fromId: "bank", toId: "dispatch", kind: "USES" },
        { fromId: "nearest", toId: "dispatch", kind: "IMPLEMENTS" },
        { fromId: "bank", toId: "request", kind: "USES" },
        { fromId: "car", toId: "doors", kind: "USES" },
        { fromId: "car", toId: "range", kind: "HAS_A" },
      ],
      decisions: [
        { title: "Dispatch is behind an interface", rationale: "The policy is the part most likely to change.", alternativeRejected: "" },
        { title: "Doors are their own controller", rationale: "Keeps the door and motion invariant in one place.", alternativeRejected: "" },
      ],
    },
    changeTest: (design) => ({
      narrative: "Express service is another dispatch policy, and ServiceRange already answers which floors a car serves.",
      impacts: impacts(design, ["car"]),
      newEntities: [
        { id: "express", name: "ExpressAwarePolicy", stereotype: "STRATEGY", responsibility: "Prefers express cars for high floors and excludes them elsewhere.", attributes: [], methods: ["selectCar(request, cars)"] },
      ],
    }),
  },
];

/**
 * A half-finished design left open on the canvas.
 *
 * The tour deep-links here so a reviewer lands on a populated editor with a
 * diagram already drawn, rather than an empty form they have to fill in before
 * the screen shows them anything.
 */
const OPEN_DRAFT: DesignDocumentInput = {
  assumptions: ["Amounts are in one currency"],
  entities: [
    { id: "group", name: "Group", stereotype: "ENTITY", responsibility: "Holds the people sharing expenses and their balances.", attributes: ["members"], methods: ["addExpense()", "balanceOf(person)"] },
    { id: "expense", name: "Expense", stereotype: "ENTITY", responsibility: "One thing someone paid for, and who shares it.", attributes: ["amount", "paidBy"], methods: ["shares()"] },
    { id: "person", name: "Person", stereotype: "ENTITY", responsibility: "Someone who can pay and owe.", attributes: ["name"], methods: [] },
    { id: "money", name: "Money", stereotype: "VALUE_OBJECT", responsibility: "An amount, with the rounding rule in one place.", attributes: ["minorUnits"], methods: ["split(n)"] },
  ],
  relations: [
    { fromId: "group", toId: "expense", kind: "HAS_A" },
    { fromId: "group", toId: "person", kind: "HAS_A" },
    { fromId: "expense", toId: "money", kind: "HAS_A" },
  ],
  decisions: [],
};

export async function seedOpenDraft(learnerId: string): Promise<string> {
  const service = new PracticeService(container());
  const attempt = await service.startAttempt(learnerId, "expense-splitter");
  await service.saveDraft(attempt.id, OPEN_DRAFT);
  return attempt.id;
}

export async function seedDemoHistory(learnerId: string): Promise<number> {
  const c = container();
  const service = new PracticeService(c);
  const worker = new EvaluationWorker(c);

  for (const [index, seed] of ATTEMPTS.entries()) {
    const attempt = await service.startAttempt(learnerId, seed.slug);

    await service.submitDesign(attempt.id, seed.design, `demo:${learnerId}:${index}:initial`);
    await worker.pump();

    await service.revealChangeTest(attempt.id);
    await service.submitChangeTest(attempt.id, seed.changeTest(seed.design), `demo:${learnerId}:${index}:change`);
    await worker.pump();
  }

  return ATTEMPTS.length;
}
