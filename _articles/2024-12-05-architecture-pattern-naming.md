---
title: Follow Right Architecture Patterns Naming
layout: post
categories: post
tags:
  - Android
  - Architecture
thumbnail: /static/thumbnails/img-03.jpg
---

**Factory** — responsible for creating objects. For example, `TicketStatusFactory` creates different ticket status instances based on input.

**Utils** — holds general-purpose reusable functions. `FileUtils` is a typical example, grouping all file-related helpers in one place.

**Manager** — owns and handles a specific responsibility end-to-end. `WebsocketManager` is a good example — it manages the full lifecycle of a websocket connection.

**Provider** — exposes an API or resource to other parts of the codebase. `IntentProvider` gives access to certain intents without callers knowing how they're built.

**Processor** — handles logic around processing a specific input or event. `WebsocketMessageProcessor` processes incoming websocket messages.

**Wrapper** — hides the complexity of a low-level API and prevents direct access from spreading across the codebase. `WebsocketConnectionWrapper` is a clean example.

**Repository** — manages data access with a single responsibility. It abstracts where the data comes from — network, database, or cache — so callers don't need to know.

**UseCase** — represents one specific action to be performed. `SendMessageUseCase` does exactly one thing: triggers the send message flow.

**Observer** — listens for changes and reacts to them. `MessagesPagingObserver` reacts to updates in message paging.
