/**
 * The four problems the MVP ships.
 *
 * Authored data, not database rows. Problems are written by us, change only
 * when we edit this file, and are read on every request, so putting them behind
 * a table would add a migration for no benefit. When a fifth problem is needed
 * it is appended here and nothing else changes.
 *
 * The interesting field on each is `changeTest`. It is hidden from the learner
 * until their first report exists, and its `expectedSeams` name the *concern*
 * that needed somewhere to live rather than the class that should have existed.
 * That distinction is the whole point: there is no reference solution here.
 */

import { Problem } from "@/domain/problem/Problem";

export const PROBLEMS: readonly Problem[] = [
  new Problem({
    id: "parking-lot",
    slug: "parking-lot",
    title: "Parking Lot",
    difficulty: "STARTER",
    estimatedMinutes: 30,
    rubricId: "lld-v1",
    summary: "The classic. Easy to start, and almost everyone inlines the pricing.",
    statement:
      "A multi-level parking lot issues a ticket when a vehicle enters and charges a fee when it leaves. " +
      "Different vehicle sizes fit in different spot sizes. The operator wants to know which spots are free at any moment.",
    requirements: [
      "A vehicle entering is assigned a free spot that fits it",
      "A ticket is issued on entry recording the spot and the time",
      "A fee is calculated on exit from the duration parked",
      "The spot is released when the vehicle leaves",
      "The operator can see how many spots of each size are free",
    ],
    constraints: [
      "One vehicle per spot",
      "A vehicle cannot enter if no spot fits it",
      "Assume a single physical site",
    ],
    conceptsProbed: ["Composition", "Strategy", "Enumerations vs subtypes", "State ownership"],
    changeTest: {
      requirement:
        "The operator adds electric vehicle bays with a charging point. EV bays are billed per minute of charging on top of the normal parking fee, and only EVs may use them.",
      framing:
        "Six months in, the operator signs a deal with a charging network. This is the requirement that arrives on a Tuesday.",
      parBlastRadius: 0.3,
      expectedSeams: [
        {
          id: "pricing",
          label: "Fee calculation",
          keywords: ["price", "pricing", "fee", "rate", "charge", "billing", "cost", "tariff"],
          satisfyingStereotypes: ["STRATEGY", "INTERFACE"],
          explanation:
            "Fee calculation was inlined, so a second way of charging means editing whatever class already computes the first one.",
        },
        {
          id: "spot-type",
          label: "Spot and vehicle types",
          keywords: ["type", "size", "bay", "category", "kind", "fits"],
          satisfyingStereotypes: ["INTERFACE", "STRATEGY", "ENUM", "VALUE_OBJECT"],
          explanation:
            "With no way to describe what a spot can hold beyond a fixed size, a new kind of bay means touching allocation as well.",
        },
      ],
    },
  }),

  new Problem({
    id: "elevator",
    slug: "elevator-system",
    title: "Elevator System",
    difficulty: "CORE",
    estimatedMinutes: 40,
    rubricId: "lld-v1",
    summary: "Where the scheduling policy hides inside the elevator, and shouldn't.",
    statement:
      "A building has several elevators serving many floors. People press a call button on a floor and choose a destination inside the car. " +
      "The system decides which car answers which call.",
    requirements: [
      "A floor call names a direction and is answered by exactly one car",
      "A car serves the requests it has accepted in a sensible order",
      "A car reports its current floor, direction and door state",
      "A car will not accept requests while it is out of service",
      "Requests already accepted are not lost when a new call arrives",
    ],
    constraints: [
      "Cars cannot pass each other",
      "Door state and motion are mutually exclusive",
      "Assume all cars serve all floors initially",
    ],
    conceptsProbed: ["State machines", "Strategy", "Separating policy from mechanism", "Invariants"],
    changeTest: {
      requirement:
        "The building adds express cars that serve only the lobby and floors 30 and above. They must be excluded from calls they cannot serve, and preferred for calls they can.",
      framing:
        "The tower gets an extension and the lobby jams every morning. Express service is the answer facilities picked.",
      parBlastRadius: 0.25,
      expectedSeams: [
        {
          id: "dispatch",
          label: "Dispatch policy",
          keywords: ["dispatch", "schedul", "assign", "select", "policy", "strategy", "allocate", "controller"],
          satisfyingStereotypes: ["STRATEGY", "INTERFACE", "SERVICE"],
          explanation:
            "Choosing which car answers a call is a policy. If it lives inside the elevator or the controller as a fixed rule, a second policy means rewriting it.",
        },
        {
          id: "service-range",
          label: "Which floors a car serves",
          keywords: ["range", "serves", "eligib", "capab", "zone", "canserve"],
          satisfyingStereotypes: ["INTERFACE", "STRATEGY", "VALUE_OBJECT", "ENUM"],
          explanation:
            "With no way to ask a car which floors it serves, every dispatch decision has to special-case the express ones.",
        },
      ],
    },
  }),

  new Problem({
    id: "vending-machine",
    slug: "vending-machine",
    title: "Vending Machine",
    difficulty: "STARTER",
    estimatedMinutes: 30,
    rubricId: "lld-v1",
    summary: "A state machine most people get right, wrapped around a payment model most people don't.",
    statement:
      "A vending machine holds products in numbered slots. A customer inserts coins, selects a product, and receives it along with any change. " +
      "The machine refuses selections it cannot fulfil.",
    requirements: [
      "A customer can insert coins and see the running balance",
      "Selecting a product dispenses it only if the balance and stock allow",
      "Change is returned using the coins the machine holds",
      "A customer can cancel and get their money back",
      "An operator can restock and collect the takings",
    ],
    constraints: [
      "The machine cannot dispense a product it cannot make change for",
      "One transaction at a time",
      "Coins only, at first",
    ],
    conceptsProbed: ["State pattern", "Payment abstraction", "Guard conditions", "Cohesion"],
    changeTest: {
      requirement:
        "The machine accepts contactless cards and UPI. Card payments are authorised before dispensing and captured after, and no change is returned for them.",
      framing:
        "Cash use halves in a year. The operator wants card and UPI support without replacing the machine.",
      parBlastRadius: 0.3,
      expectedSeams: [
        {
          id: "payment",
          label: "Payment method",
          keywords: ["payment", "pay", "coin", "money", "tender", "wallet", "purse", "cash"],
          satisfyingStereotypes: ["STRATEGY", "INTERFACE", "SERVICE"],
          explanation:
            "If coins are the only thing the machine understands, a second payment method has to be threaded through every place that touches a balance.",
        },
        {
          id: "transaction-state",
          label: "Transaction state",
          keywords: ["state", "idle", "transaction", "session", "status"],
          satisfyingStereotypes: ["INTERFACE", "STRATEGY", "ENUM"],
          explanation:
            "Card payments add an authorise step between selection and dispensing. Without an explicit state model there is nowhere to put it.",
        },
      ],
    },
  }),

  new Problem({
    id: "expense-splitter",
    slug: "expense-splitter",
    title: "Expense Splitter",
    difficulty: "CORE",
    estimatedMinutes: 40,
    rubricId: "lld-v1",
    summary: "Splitwise in miniature. The split rule is the seam, and it is easy to miss.",
    statement:
      "A group of people share expenses. Someone pays for something, the cost is split among the group, and the app tracks who owes whom. " +
      "Balances settle when someone pays another back.",
    requirements: [
      "An expense records who paid, how much, and who shares it",
      "A cost can be split equally or by exact amounts per person",
      "Each person's net balance within a group is known at any time",
      "A settlement between two people reduces what is owed",
      "A group's expense history can be listed",
    ],
    constraints: [
      "Amounts are in one currency",
      "A split must add up to the total exactly",
      "A person can be in several groups",
    ],
    conceptsProbed: ["Strategy", "Value objects", "Money handling", "Aggregate boundaries"],
    changeTest: {
      requirement:
        "Splits can now be by percentage, and by shares, for example one person taking two shares of a three-share split. Both must still add up to the total exactly.",
      framing: "The first thing every user asks for after equal and exact splits.",
      parBlastRadius: 0.25,
      expectedSeams: [
        {
          id: "split-rule",
          label: "Split rule",
          keywords: ["split", "share", "divide", "allocat", "apportion", "distribut"],
          satisfyingStereotypes: ["STRATEGY", "INTERFACE"],
          explanation:
            "Equal and exact splits look like two cases until a third arrives. If they were an if-else inside Expense, every new rule edits that class.",
        },
        {
          id: "money",
          label: "Money and rounding",
          keywords: ["money", "amount", "currency", "cents", "paise", "round", "balance"],
          satisfyingStereotypes: ["VALUE_OBJECT", "INTERFACE", "STRATEGY"],
          explanation:
            "Percentages create remainders. With no money type owning rounding, every split rule has to solve it again and they will disagree.",
        },
      ],
    },
  }),
];

export const PROBLEMS_BY_ID = new Map(PROBLEMS.map((p) => [p.id, p]));
export const PROBLEMS_BY_SLUG = new Map(PROBLEMS.map((p) => [p.slug, p]));
