# Semantic Metamodel and Relationship Intelligence

## 1. Purpose

The modelling engine shall support a **dynamic, user-configurable metamodel** while retaining a small set of **built-in semantic relationship types** that provide intelligence to the modelling tool.

The built-in semantic types are not intended to impose a complete architecture framework such as ArchiMate. Instead, they provide common architectural semantics that the tool can understand regardless of the user's custom metamodel.

This allows users to model freely while enabling the tool to understand concepts such as:

* containment and composition
* abstraction and realisation
* conceptual-to-physical traceability
* information and data representation
* flows and dependencies
* service provision and consumption
* API interactions
* request/response behaviour
* impact and dependency analysis
* upstream/downstream tracing

The fundamental principle is:

> **The metamodel defines what users can model; semantic base types define what the modelling engine understands about what has been modelled.**

---

# 2. Dynamic Metamodel

The modelling engine shall allow users to define and customise:

* Element Types
* Relationship Types
* Properties
* Property Types
* Relationship Properties
* Constraints and validation rules

Custom element and relationship types may optionally be based on, or associated with, a built-in semantic base type.

For example:

```text
Custom Type:        Payment Service
Semantic Category:  Service
Semantic Level:     Conceptual
```

and:

```text
Custom Relationship: Calls
Semantic Base Type:  Interaction
```

The custom terminology therefore remains under the user's control while the engine retains semantic understanding.

---

# 3. Semantic Levels

Elements may have a semantic representation level.

The initial levels are:

```text
Conceptual
Logical
Physical
Implementation / Runtime
```

These are not intended to become rigid modelling layers.

They are metadata describing the **degree of abstraction or concreteness** of an element.

For example:

```text
Conceptual
    Payment Service

Logical
    Payment API

Physical
    GET /orders/{id}

Implementation
    Orders Service
```

The same or similar business terminology may legitimately occur at different levels.

The tool shall therefore not require names to uniquely determine meaning.

Instead, meaning shall be derived from:

* element type
* semantic level
* relationships
* properties
* descriptions
* traceability

---

# 4. Core Semantic Relationship Types

The initial built-in semantic vocabulary should remain deliberately small.

## 4.1 Containment

Represents structural membership within the modelling repository or model hierarchy.

```text
A
└── B
```

Meaning:

> B is contained by A in the model structure.

Tool implications:

* explorer hierarchy
* navigation
* move operations
* structural grouping
* containment-aware deletion
* model organisation

Containment is distinct from semantic Composition.

---

## 4.2 Composition

Represents a strong structural relationship where B is an intrinsic part of A.

```text
A ◆── B
```

Tool implications:

* lifecycle awareness
* structural analysis
* ownership
* optional cascading behaviour
* composition-aware visualisation

Composition does not have to imply repository containment.

---

## 4.3 Aggregation

Represents a weaker "whole and part" relationship.

```text
A ◇── B
```

B contributes to or belongs to A but is not necessarily inseparable from it.

---

## 4.4 Association

Represents a generic relationship where the model needs to establish that A and B are related without asserting a stronger semantic meaning.

Association is intentionally the weakest semantic relationship.

It acts as an escape hatch when a stronger relationship is inappropriate.

---

## 4.5 Realisation

Represents a relationship between an abstract/conceptual/logical thing and a more concrete thing that provides or implements it.

```text
Concept
   │
   │ Realised by
   ▼
Concrete representation
```

Example:

```text
Payment Service
      │
      │ realised by
      ▼
Payment API
```

and:

```text
Payment API
      │
      │ realised/implemented by
      ▼
Payment Service Application
```

Tool implications:

* conceptual → logical → physical tracing
* implementation tracing
* abstraction navigation
* "show implementation"
* "show what this implements"
* impact analysis across abstraction levels

The exact terminology presented to users may be customised while retaining the underlying semantic meaning.

---

## 4.6 Representation

Represents a concrete representation of a conceptual or logical information object.

```text
Payment Information
       │
       │ represented by
       ▼
Payment JSON
```

Examples:

```text
Payment Information
    ↓
Payment Logical Model
    ↓
Payment JSON
    ↓
Payment Database Record
```

Tool implications:

* information lineage
* conceptual → logical → physical tracing
* data representation analysis
* physical data impact analysis

Representation is deliberately distinct from Realisation.

---

## 4.7 Serving

Represents a provider/consumer dependency.

```text
Provider ─────► Consumer
```

Meaning:

> A provides a capability, service or function that B consumes.

Tool implications:

* provider/consumer navigation
* dependency analysis
* "who consumes this?"
* "what does this depend on?"
* impact analysis

---

## 4.8 Access

Represents access to information or data.

```text
Application ─────► Data
```

The relationship may optionally specify:

```text
Read
Write
Read/Write
```

Tool implications:

* data lineage
* data dependency analysis
* read/write analysis
* impact analysis
* security analysis

---

## 4.9 Flow

Represents semantic movement between elements.

```text
A ─────────► B
```

A Flow is directional.

The thing flowing may be identified separately from the endpoints.

For example:

```text
Payment Service A
       │
       │ Flow
       │ carries: Payment Information
       ▼
Payment Service B
```

The flow may represent:

* information
* data
* an object
* a message
* a business concept
* another semantic payload

The payload is not required to be a physical file or message.

Tool implications:

* upstream/downstream analysis
* flow chains
* flow tracing
* payload tracing
* impact analysis
* conceptual information-flow analysis

---

## 4.10 Trigger

Represents a causal or initiating relationship.

```text
A ── triggers ──► B
```

Trigger is distinct from Flow.

A Flow means something moves between A and B.

A Trigger means A causes or initiates B.

---

## 4.11 Assignment

Represents responsibility or performance.

```text
A ── assigned to ──► B
```

Examples:

```text
Actor → Business Process
Application → Application Behaviour
Role → Responsibility
```

Tool implications:

* responsibility analysis
* ownership
* "who performs this?"
* "what does this actor/application perform?"

---

## 4.12 Influence

Represents an effect or influence without asserting direct causation.

Examples:

```text
Risk ─────► Architecture Decision
Requirement ─────► Design
Goal ─────► Capability
```

The relationship may optionally have a positive/negative/neutral influence property.

---

## 4.13 Specialisation

Represents an "is a type of" relationship.

```text
Card Payment Service
        │
        │ specialises
        ▼
Payment Service
```

Tool implications:

* type hierarchy
* inheritance
* polymorphic queries
* grouping by parent semantic type

---

# 5. Relationships Are First-Class Semantic Objects

Relationships shall not be treated as simple lines between two elements.

A relationship shall be capable of carrying semantic properties.

Conceptually:

```text
Relationship
├── Type
├── Semantic Base Type
├── Source
├── Target
├── Direction
├── Properties
└── Payload / Content
```

This allows a relationship such as:

```text
Payment Service A
       │
       │ Flow
       │
       │ carries: Payment Information
       │ format: JSON
       │ protocol: REST
       ▼
Payment Service B
```

without requiring a specialised relationship type called:

> REST JSON Payment Information Flow.

---

# 6. Flow Payloads

Flows may identify the conceptual or logical thing being transported.

For example:

```text
Payment Service A
       │
       │ Flow
       │ carries Payment Information
       ▼
Payment Service B
```

Payment Information may then have its own representation chain:

```text
Payment Information
       │
       │ represented by
       ▼
Payment Logical Model
       │
       ├── represented by → Payment JSON
       │
       └── represented by → Payment DB Record
```

The tool shall therefore be able to trace:

```text
Conceptual Information
        ↓
Logical Information
        ↓
Physical Representation
        ↓
Flow
        ↓
Consumer
```

and reverse-trace the same chain.

---

# 7. Multiple Flows Between the Same Elements

The model shall explicitly support multiple relationships between the same source and target elements.

For example:

```text
Application A
    │
    ├──── Flow ────► Application B
    │       Payment Information
    │
    ├──── Flow ────► Application B
    │       Customer Information
    │
    └──── Flow ────► Application B
            Settlement Information
```

These are separate relationships even though the endpoints are identical.

The relationship's semantic meaning, payload and properties distinguish them.

The tool shall never assume:

> one pair of elements = one relationship.

---

# 8. Physical API Interaction

At physical or implementation levels, a simple Flow is sometimes insufficient.

For example:

```text
Order Service
     │
     │ GET /orders/123
     ▼
Order API
```

with a response:

```text
Order API
     │
     │ 200 Order
     ▼
Order Service
```

The model should not require these to be treated as unrelated flows.

The engine shall support a higher-level **Interaction / Exchange** concept.

Conceptually:

```text
Interaction
├── Source
├── Target
├── Request
└── Response
```

For example:

```text
Order Consumer
        │
        │ Interaction
        ▼
Order API

Request:
    GET /orders/123

Response:
    Order
```

The request and response are themselves directional flows/messages within the interaction.

---

# 9. Synchronous Interaction

A synchronous API interaction may therefore be represented as:

```text
Order Consumer
       │
       │ Interaction
       ▼
Order API
       │
       ├── Request
       │      GET /orders/123
       │
       └── Response
              Order
```

The important distinction is:

> **Interaction represents the communication exchange; Flow represents the movement of a particular message, information object or payload.**

This avoids creating separate specialised relationship types for every API operation.

The Interaction may contain properties such as:

```text
Protocol: REST
Pattern: Synchronous
Operation: GET /orders/{id}
```

while the request and response identify the actual semantic payloads.

---

# 10. Conceptual Versus Physical Flow

The same semantic Flow mechanism shall operate at different abstraction levels.

### Conceptual

```text
Customer Service
       │
       │ Flow
       │ Customer Order
       ▼
Order Management
```

The flow represents a conceptual business exchange.

### Logical

```text
Order Management
       │
       │ Flow
       │ Order Information
       ▼
Fulfilment Service
```

The flow represents logical information exchange.

### Physical

```text
Order Client
       │
       │ Interaction
       │ GET /orders/123
       ▼
Orders API
       │
       │ Response
       ▼
Order JSON
```

The physical representation can be traced back to the logical and conceptual meaning.

---

# 11. Conceptual and Logical Flows May Be Bidirectional

The model shall not assume that communication between two elements is inherently one-way.

For example:

```text
Application A
   │
   ├── Flow ──► Application B
   │
   └── Flow ◄── Application B
```

The two directions represent separate semantic flows.

At conceptual level these may represent:

```text
Request
Response
```

or:

```text
Customer Information
Payment Information
```

At logical level they may represent completely different purposes:

```text
A → B
    Payment Instruction

B → A
    Payment Status

A → B
    Customer Update

B → A
    Customer Confirmation
```

The engine shall therefore support multiple independent directional relationships between the same elements.

---

# 12. Avoid Over-Modelling

The semantic framework shall deliberately avoid creating a unique relationship type for every possible architectural scenario.

For example, the tool should not require types such as:

```text
REST GET Flow
REST POST Flow
JSON Flow
Payment Flow
Synchronous API Flow
Database Flow
Event Flow
```

Instead, these should be represented using combinations of:

```text
Flow
Interaction
Payload
Properties
Protocol
Pattern
Representation
```

For example:

```text
Interaction
    Pattern: Synchronous
    Protocol: REST
    Operation: GET /orders/{id}

    Request:
        Order Query

    Response:
        Order
```

This keeps the core semantic model manageable.

---

# 13. Semantic Base Types and Custom Types

A custom relationship may inherit or map to a semantic base type.

Example:

```text
Custom Relationship:
    "Calls"

Semantic Base Type:
    Interaction
```

Another:

```text
Custom Relationship:
    "Publishes"

Semantic Base Type:
    Flow
```

Another:

```text
Custom Relationship:
    "Implements"

Semantic Base Type:
    Realisation
```

The custom type controls terminology and metamodel presentation.

The semantic base type controls engine behaviour.

---

# 14. Tool Intelligence

The modelling engine shall use semantic relationships to provide intelligent behaviour including:

### Navigation

* show related elements
* show providers
* show consumers
* show implementations
* show representations
* show upstream/downstream elements

### Traceability

* conceptual → logical
* logical → physical
* physical → implementation
* information → representations
* flow → payload → representation

### Impact Analysis

Examples:

> What uses this service?

> What flows into this application?

> What systems consume this information?

> What physical interfaces implement this logical service?

> What flows are affected if this information changes?

### Validation

The engine may identify:

* invalid relationships
* unusual relationships
* missing realisations
* missing implementations
* orphaned conceptual elements
* flows without identifiable payloads where a payload is expected

Validation should be configurable rather than making every semantic rule a hard constraint.

---

# 15. Explorer Behaviour

The model explorer shall understand both:

1. structural containment
2. semantic relationships

For example:

```text
Payments Platform
│
├── Contents
│   ├── Payment API
│   ├── Payment Service
│   └── Payment Database
│
├── Realises
│   └── Payment Service
│
├── Serves
│   ├── Mobile Application
│   └── Web Application
│
├── Accesses
│   └── Customer Database
│
└── Flows
    ├── Payment Information
    └── Settlement Information
```

The explorer should therefore not simply be a file tree.

It should be capable of acting as a **semantic architecture navigator**.

---

# 16. Core Design Principle

The architecture model shall be treated as a semantic graph.

Elements represent architectural things.

Relationships represent the meaning between those things.

Properties provide additional detail.

Flows and interactions may identify semantic content.

Representations connect abstract concepts to increasingly concrete forms.

Conceptually:

```text
                    ELEMENTS
                       │
                       │
             ┌─────────┴─────────┐
             │                   │
       Relationships         Properties
             │
             ▼
      Semantic meaning
             │
     ┌───────┼────────┐
     ▼       ▼        ▼
  Structure  Flow   Realisation
             │        │
             ▼        ▼
          Payload   Representation
             │        │
             └────┬───┘
                  ▼
             Traceability
```

The objective is not to reproduce a particular architecture framework.

The objective is to give the modelling engine enough **semantic understanding** that a dynamically defined metamodel can still support intelligent modelling, navigation, validation and analysis.

---

# 17. Guiding Principle

> **Keep the metamodel flexible, keep the semantic primitives small, and put intelligence into the relationships.**

A user should be able to create their own architecture language, while the engine can still understand fundamental concepts such as:

**contains, composes, aggregates, serves, accesses, flows, triggers, realises, represents, assigns, influences, specialises and interacts.**

The resulting model should allow an architect to move naturally from:

**concept → logical representation → physical implementation → runtime representation**

and from:

**thing → flow → payload → representation → consumer**

without requiring every intermediate concept to be modelled in exactly the same way.
