---
title: Mobile System Design
layout: post
categories: post
tags:
  - Kotlin
  - Android
---

Before building a product, we need to set some requirements, architecture designs, security concerns etc. These play a important role in organizing , creating fast and scalable applications. A typical mobile system design includes application features, architecture design, out of scope requirements like crash reporting, analytics etc.

In Mobile System Design sessions, Interviewer wants to understand the candidate thought process, problem solving, architecture design solutions, edge cases from candidate. It's always better to gather the ground before your start. You should start with simple questions and ask as much as you can.

I've seen multiple candidates in interviews start their introduction and end up with 5–6 mins. It's recommended to have a short introduction about yourself. You can start with — i.e "I'm X working on android/ios application and libraries since 2020. From past 2 years, I'm leading a team of x product used for messaging." A typical system design interviews should be 40–45 mins by splitting into High level design (20 mins), Low level design (20 mins) etc.

#### Information Gathering*

After the introduction, It's recommend to start with information gathering by asking questions as much as you can. But you should be careful to not ask for solutions every time. Instead, Ask them the requirements and give them the solutions. Indeed, Interviewer want to understand the thought process of candidate. In general, Information gathering divided into 3 aspects.
1. Functional Requirements
2. Non-Functional Requirements
3. Out of Scope
4. Resources

**Functional Requirements**

Functional requirements are the features or screens that immediately visible to the user while navigating to the application. For example,
1. User able to scroll to messages.
2. User able to send message.
3. User able to send attachments/photos.
4. User able to delete a message.


**Non-Functional Requirements**

Non-functional requirements plays a important role in making application more stable and scalable. For example,
1. Realtime notifications
2. Realtime Sync
3. Offline Support
4. CPU/Batter Optimizations


**Out Of Scope**

Additional requirements different from features that plays a important role in application.
1. Analytics
2. Crash Reporting
3. Remote Logging
4. Performance
5. Accessibility
6. Security

**Resources**

Generally, resources including additional requirement gathering like team size, locale, number of users etc. While gathering the resources information, you can ask these questions like,

**How big is engineering team?**

Building a product for a small team is always different from a product designed only for large team. A large team designed product is more structured and modularized to scale and better management of product.

**What is the excepted numbers of total users?**

A large number of numbers excepted to create the sever load. This question might make sense while managing the API clients and server side issues.

**Are we targeting a specific area like India?**

This question might make sense while designing the product for the different internet connectivity areas. A low internet connectivity area requirements minimum api connections to reduce the bandwidth.

#### High Level Design

Before you move into high level design, Ask your interviewer — Should i start with High level design or Low level design? High level design including a typical product structure like modules with exposing the internal communication. A low level design explains the internal communication between the modules or features.

![System Design Overview](/static/post-image/systemdesign-img1.png)

**How to approach the high level design?**

At first glance, It’s recommended to start with features, server-client communication, models, then come down to low system design. Let’s understand this one by one.

**Functional Requirements** — Start with explaining functional requirements like application features.
- What features is required?

**Client-Server Communication** — Define the communication frameworks like Https, websocket, Nats, Https Polling etc.
- Which one should be used — Https, GraphQL etc.
- Why choose Nats over websocket?
- What are the disadvantages of using Http Polling?
- What are the advantages of using web-socket?

**API Design** — Define the API used to implement the feature on server client. For instance, fetching the chat list using `/chats` API.

**Data Models** — Define the data models.
- Draw and choose the properties inside data model?
- Can we have a list inside a data model that will be stored in local database?

**Repository, Local And Network** — Define the communication between repository, local database and network data source.

**Non-Functional Requirements** — Explain how to manage non-functional requirements like realtime sync, realtime notifications etc.
- What are the disadvantages of using server side notifications?
- What are the issues caused during realtime sync? And how to deal with them?
- How to handle cache?


#### Low Level Design

After diving into high level design, Let’s try to understand the low level design or app flow. It’s recommend to start the deep dive session after getting the signal from interviewer. Low level design or deep dive session include architecture design, state, screen etc.

![System Design Overview](/static/post-image/systemdesign-img2.png)

**How to approach the low level design?**

**Architecture** — Define the architecture design should be followed according to application requirements.
- Why choose MVVM over MVC?

**Dependency Injection** — Define the dependency injection.
- Why we need dependency injection?

**Pagination or Remote Mediator** — Define how pagination will work.

**Usecase** — Define the usecase which is responsible for reducing the complexity of business logic.

**ViewModel & State** — Define the viewmodel and it’s usages If we are following the MVVM architecture. For instance, How screen or UI will communicate to viewmodel?

**Out of Scope** — Explain the out of scope requirements like — How to secure the application? How to gather the data like events and use as analytics?
- Explain Security practises.
- What are the advantages of using Analytics?

**Performance** — Define the performance matrix. For instance,
- How large images will affect the scrolling performance?
- How threading will affect the performance?
- How to load large amount of data?

**Accessibility** — Define the accessibility. For instance,
- How UI components sizing and colors will affect the users?
- Color Contract and small text size will affect some users?

**Localization** — Define the localization. Localization means enabling the local languages in the application to make it more usable.

**Security** — Define the security matrix. For instance,
- How to secure the secrets key like API Keys?
- How to secure the local backup or local database data?
- How app permissions will affect the security measures?
- How to encrypt the data?

and here we are done!
Thanks for reading!
