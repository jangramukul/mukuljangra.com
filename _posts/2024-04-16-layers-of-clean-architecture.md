---
title: Understanding the Layers of Clean Architecture
layout: post
categories: post
tags:
  - Android
  - Architecture
  - Clean Architecture
---
Before diving into a project structure, let's first understand the layers of architecture. We generally have three layers: Data, Domain, and Presentation.

### Data Layer
The data layer is a part of the business logic. It includes local storage or caching, networking, models and mappers, etc. It manages data operations like fetching data from the network or local database. It's a good practise if we define separate data sources for the network and database. Often, we get into the mess of merging network and database data sources. Sometimes, we need an in-memory cache to preserve the data. Suppose a new requirement is introduced for the News app: when the user opens the screen, cached news must be presented to the user if a request has been made previously. Otherwise, the app should request a network to fetch the latest news. You can preserve data while the user is in your app by adding in-memory data caching. Caches are meant to save some information in memory for a specific time — in this case, as long as the user is in the app. Using Mutex from Kotlin Coroutines, we can lock the thread-safe write. Suppose the user navigates away from the screen while the network request is in progress, it'll be canceled, and the result won't be cached. In this case, you can make an APIs call inside some external coroutine scope.

### Domain Layer
The domain layer is responsible for encapsulating the complex business logic. It connects UI and Data layer using a reusable usecase or interactor that can easily reuse by multiple data providers like the viewmodel. Usecase is responsible for single data operations like fetching data from users, inserting data into local databases, validating input types, etc.

### Presentation Layer
The presentation layer is also known as UI Layer. It is responsible for displaying application data on the screen. In simple words, it deals with the UI part of an application. In Presentation layer, UI triggers the event to viewmodel or other source or vice versa. It's a bad practise to expose the data directly from viewmodel or another source to UI Layer. Rather than having multiple states or properties for updating the UI, you should consider making a single State Model that holds only required UI Data. The key benefit of this is UI able to focus on only one role of reading the data, not writing or mapping the data.As a result, you should never modify the UI state in the UI directly unless the UI itself is the sole source of its data. Only the source or owner of data should be allowed to update the data, not the UI directly. You should consider the immutability of the UI state because exposing the right to update/write data directly to UI is not a good idea. The key to this principle is that exposing data is only allowed to its owner, not UI. 