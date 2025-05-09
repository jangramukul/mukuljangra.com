---
title: Kotlin Flows With Operators Guide
layout: post
categories: post
tags:
  - Android
  - Kotlin Coroutines
---

Coroutines And Flow are one of the ways to deal with asynchronous programming with multiple operators like RxJava. In Android, We use coroutines for dealing with multi-threading, concurrency, thread locks etc. And Kotlin Flow used used for asynchronous data streams like RxJava. In this article, we are heading towards Kotlin Flow.

Kotlin Flow is a data emitter who can emit values. Kotlin Flows built on top of kotlin coroutines to support concurrency. There are three main components in kotlin flows in order to understand the mechanism of kotlin flows :

- **Producer or Emitter** - It emit values.
- **Middleware** - It can modify values that will consumed by a consumer.
- **Consumer** - Emitted values will later consumed by consumer.

### Hot vs Cold Flow

Cold Flows are those producers that doesn't starting emitting values until unless it has a collector or consumer. Simple Flow builder is a cold flow.
- It emits data only when there is a collector or consumer.
- It does not store data.
- It cannot have multiple collectors or consumers.

Hot Flows are those producers that emit data even there is not collector or consumer. StateFlow is a hot flow. You can convert a cold flow into hot flow using shareIn function.
- It emit data even when there is not collector or consumer.
- It is possible to store values.
- It can have multiple collectors or consumers.

### Flow vs StateFlow vs SharedFlow
In Kotlin, there are multiple flows types and it's usecases. Lets try to understand these types one by one.

Flow is a simplest flow you can create using flow builder or some extensions. Flow is a cold flow that cannot have multiple collectors. For simple usecases, like making a api call using repository pattern, we can use simple flow to handle these usecases.

```kotlin
//create a cold flow using flow builder
val users = flow {
    emit("Alex")
}

//collect
users.collect {
    //user
}.flowIn(Dispatchers.IO) //adding a dispatcher to upstream flow

//convert list to flow
listOf(1,3,4).asFlow() 

//convert intRange to flow
(0..5).asFlow() 

//convert array to flow
arrayOf("hello").asFlow()

//using builder api
val flow = flow { 
   emit(1)
   delay(100L) //delay
   emit(2)
}
```

StateFlow is a flow hot that can have multiple collectors at same time. StateFlow behave like a value holder which emits the last value to all known collectors. While creating stateflow, we need to gave a initial value. Like Livedata, we can configure it with lifecycle aware coroutines scopes to attach with lifecycle. It has value property to access.

```kotlin
//create a stateflow
private val _state = MutableStateFlow(State.IDLE) //assign a initial
val state: StateFlow<State> get() = _state

//collect
state.collectLatest {
    //new state
}

//stateflow have value property to access latest value
val newState = state.value
```

SharedFlow is a hot flow that can have multiple collectors at same time. Unlike StateFlow, It doesn't behave like a data holder like stateflow does. It doesn't have any value property like stateflow has. Also, Unlike StateFlow, you cannot attach it with lifecycle components.

```kotlin
//create a sharedFlow
private val _sharedFlow = MutableSharedFlow<State>()
val sharedFlow: SharedFlow<State> get() = _sharedFlow

//collect
sharedFlow.collect {
   //collect all items
}
```

There are multiple operators in Kotlin Flow like RxJava. We will go one by one and understand the usecases of these operators.

#### **Retry Operator**
You can retry or rerun the flow when some certain condition meet.

```kotlin
//create a flow
val flow = flow {
   emit(1)
   throw IllegalArgumentException("") //throw exception
}

//retry 3 times
flow.retry(3) { cause ->
    return@retry if(cause is IllegalArgumentException) {
          true //retry
    } else {
         false //don't retry
    }
}

//retryWhen is a another way to retry flow
flow.retryWhen { cause, attempt 
    return@retryWhen if(attempt < 3 && cause is IllegalArgumentException) true
    else false
}
```

#### **With Timeout**
You can timeout and cancel the flow collector.

```kotlin
//cancel the collection after 3000L
withTimeout(3000L) {
  flow.collectLatest {
     //collect
  }
}
```

#### **Catch Operator**
In Kotlin flows, you able to catch the exceptions from streams.

```kotlin
flow.catch { 
     //catch exception 
}.collect { 
    //collect
}
```

#### **Debounce Operator**
In Kotlin Flows, you able to debounce the each emitted item with specific time frame.

```kotlin
//debounce each item with 1000 second
flow.debounce(1000L)
.collect {
  //collect each item after 1 second
}
```

#### **Zip Operator**
Zip used for combine the multiple flows emissions into single flow. It only emits an item when all flows have emitted an item, and the resulting flow completes only when all input flows complete.

```kotlin
//create flows
val flow1 = (0..1).asFlow()
val flow2 = (1..5).asFlow()

//zip
flow1.zip(flow2) { a, b -> 
   a + b
}.collect {
  //a + b
}
```

#### **Combine Operator**
Combine operator is same as zip operator. But it emits an item as soon as one of the flows emits item and only completes the flow when all flows gets completed.

```kotlin
flow1.combine(flow2) { a, b ->
   a + b 
}.collect {
  //a + b
}
```

#### **Merge Operator**
Merge operator is same as combine operator. It emits item as soon as one of the flows emits item and only completes the flow when all flows gets completed. It keeps the order of items as they emitted from flows. But it doesn't guarantee the order of items.

```kotlin
val mergedflows = merge(flow1, flow2)
```

#### **FlatMapConcat Operator**
FlatMapConcat combines the emissions of all resulting flows and convert them into a single flow. It wait for the flow to complete before starting a new one.

```kotlin
//create a flow
val flow = (0..10).asFlow()

//flatMap
flow.flatMapConcat { value ->
   //0,1,2,3,4,5..
   //convert each value to flow, in each loop, it wait for the flow to complete before staring the new one.
   value.asFlow() //convert each value to flow
 }
.collectLatest {
  //collect
}
```

#### **FlatMapMerge Operator**
FlatMapMerge combines the emissions of all resulting flows and convert them into single flow. It merge the all flows and emit them at once.

```kotlin
//create a flow
val flow = (0..10).asFlow()

//flatMap
flow.flatMapMerge { value ->
   //0,1,2,3,4,5..
   //convert each value to flow, and wait for all values to finish and merge all the flows and emit them at once.
   value.asFlow()
}.collect {
  //collect
}
```

#### **FlatMapLatest Operator**
FlatMapLatest combines the emissions of all resuting flows and convert them into single flow. It discord the current flow if latest flow comes in and emit it.

```kotlin
//create a flow
val flow = (0..10).asFlow()

//flatMap
flow.flatMapLatest { value ->
   //0,1,2,3,4,5..
   //convert each value to flow, if there is new values emitted, it discord the current flow and try to create a new flow and emit it.
   value.asFlow()
}.collect {
  //collect
}
```

#### **Transform Operator**
Like map operator, it is used to transform the one data type to another data type by emiting the transformed value.

```kotlin
//create a flow
val flow = (0..10).asFlow()

//flatMap
flow.transform<Int, String>() { value ->
    emit(value.toString())
}
.collect {
  //collect all strings
}
```

#### **Drop And Take Operator**
Drop operator used for dropping the first emitted values and take used for taking the first emitted values in kotlin flow.

```kotlin
//create a flow
val flow = (0..10).asFlow()

//flatMap
flow.drop(2) //drop first 2 emitted values 
.take(3) //take only 3 emitted values
```

Thank You!






