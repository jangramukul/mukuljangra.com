---
title: Design Patterns Guide in Kotlin
layout: post
categories: post
tags:
  - Kotlin
  - Architecture
  
---

You might wonder how software engineers are able to write well-structured, flexible, and clean code. You might also wonder what patterns and principles they follow to master clean code. Let's break down the topic into smaller chunks and look at the core principles and key points to master clean, flexible, and testable code.

One of the most important principles of clean code is to write code that is easy to understand. This means using clear and concise language, avoiding jargon, and making sure that the code is well-structured. Another important principle is to write code that is flexible. This means making sure that the code can be easily changed and adapted to meet new requirements. Finally, clean code should be testable. This means that the code should be written in a way that makes it easy to write unit tests for.

There are many different patterns and principles that software engineers can follow to write clean code. Some of the most common patterns include the Single Responsibility Principle(SRP), the Open/Closed Principle(OCP), and the Liskov Substitution Principle(LSP). These principles help to ensure that code is well-structured and easy to understand. By following these principles and key points, software engineers can write clean code that is easy to understand, flexible, and testable.

In this article, we will deep dive into design patterns with real examples to understand their usecases. In the upcoming articles, We will more focus on core principles for clean and testable code. So follow up for the next useful upcoming articles.

A design pattern is a general, reusable solution to a commonly occurring problem in software design. It is a pattern that describes how to solve a problem that arises repeatedly in software development.

Design patterns are not specific to any programming language, but they can be implemented in any language that supports object-oriented programming. Kotlin is a programming language that supports object-oriented programming, so it can be used to implement design patterns. There are multiple design patterns in software engineering and all of these are classified into three categories:

1. Behavioural Pattern
2. Creational Pattern
3. Structural Pattern

These patterns can be used to solve common problems in software development, such as creating reusable code, managing dependencies, and creating user interfaces. Let's come together and look after design patterns in kotlin.

## Behavioural Patterns

Behavioural patterns are software design patterns that focus on the ways in which objects interact. They are used to solve common problems that occur when designing and implementing object-oriented software.

### Observer Pattern

The observer pattern is a software design pattern that enables objects to subscribe to and receive notifications when events occur in other objects. In android development, If you have ever used RxJava or RxAndroid, these framework components are also using observer patterns. In Kotlin, the observer pattern can be implemented using the following code:

```kotlin
fun main() {
   val station = WeatherStation()
   val observer = StationMaster()
   station.addObserver(observer)

   station.setTemp(1)
   station.setTemp(2)
   station.setTemp(3)

   station.removeObserver(observer)
   station.setTemp(4)
}

// Observable is responsible for adding, removing, and notifying observers.
private interface Observable {
   fun addObserver(observer: Observer)
   fun removeObserver(observer: Observer)
   fun notifyAllObservers()
}

// Observer is one who gets changes of state
private interface Observer {
   fun onChange(value: Int)
}

private interface Station {
   fun setTemp(temp: Int)
}

private class WeatherStation : Station, Observable {
   private val observers = mutableListOf<Observer>()
   private var temp: Int = 0

   override fun setTemp(temp: Int) {
       this.temp = temp
       notifyAllObservers()
   }

   override fun addObserver(observer: Observer) {
       observers.add(observer)
   }

   override fun removeObserver(observer: Observer) {
       observers.remove(observer)
   }

   override fun notifyAllObservers() {
       observers.forEach { it.onChange(temp) }
   }
}

private class StationMaster : Observer {
   override fun onChange(value: Int) {
       println("onChange - $value")
   }
}
```

### Strategy Pattern

The strategy pattern is a behavioural design pattern that allows you to change the behaviour of an object at runtime without changing the object's interface. In Kotlin, the strategy pattern is implemented using interfaces and abstract classes. Here is an example of the pattern in Kotlin:

```kotlin
fun main() {
   val context = PaymentContext()
   val paytmPaymentStrategy = PaytmPaymentStrategy()
   val googlePaymentStrategy = GooglePaymentStrategy()

   context.setStrategy(paytmPaymentStrategy)
   context.pay(1)

   context.setStrategy(googlePaymentStrategy)
   context.pay(2)
}

private interface PaymentStrategy {
   fun pay(orderId: Int)
}

private class PaytmPaymentStrategy : PaymentStrategy {
   override fun pay(orderId: Int) {
       // Implementation
   }
}

private class GooglePaymentStrategy : PaymentStrategy {
   override fun pay(orderId: Int) {
       // Implementation
   }
}

private class PaymentContext {
   private lateinit var strategy: PaymentStrategy
   
   fun setStrategy(strategy: PaymentStrategy) {
       this.strategy = strategy
   }

   fun pay(orderId: Int) {
       strategy.pay(orderId + 10)
   }
}
```

### Command Pattern

A command pattern is a behavioural pattern that is used for pushing the actions or commands that can execute at any given point of time. Here is an example of the pattern in Kotlin:

```kotlin
fun main() {
   val host = PaymentHost()
   val makePaymentCommand = MakePaymentCommand(host, 1)
   val revertPaymentCommand = RevertPaymentCommand(host, 1)
   val executor = PaymentCommandExecutor()

   executor.execute(makePaymentCommand)
   host.printPayments()

   executor.execute(revertPaymentCommand)
   host.printPayments()

   executor.execute(makePaymentCommand)
   host.printPayments()
}

private interface Command {
   fun execute()
}

private class MakePaymentCommand(
   private val host: PaymentHost, 
   private val order: Int
) : Command {
   override fun execute() {
       host.make(order)
   }
}

private class RevertPaymentCommand(
   private val host: PaymentHost, 
   private val order: Int
) : Command {
   override fun execute() {
       host.revert(order)
   }
}

private class PaymentHost {
   private val payments = mutableListOf<Int>()

   fun make(order: Int) {
       payments.add(order)
   }

   fun revert(order: Int) {
       payments.remove(order)
   }

   fun printPayments() {
       if (payments.isEmpty()) {
           println("no payment found")
       } else {
           payments.forEach { println("order id - $it") }
       }
   }
}

private class PaymentCommandExecutor {
   private val commands = mutableListOf<Command>()

   fun execute(command: Command) {
       commands.add(command)
       command.execute()
   }
}
```

### State Pattern

State pattern is a simplest pattern in kotlin which represents the state using enums, sealed classes etc. In android development, state pattern generally used in view-model in MAA architecture to represent the model consumed by ui. Here is an example of the pattern in Kotlin:

```kotlin
private sealed interface LoginState {
   object Active : LoginState
   object InActive : LoginState
   object Idle : LoginState
}

private class AuthPresenter {
   private var state: LoginState = LoginState.Idle

   fun login() {
       state = LoginState.Active
   }

   fun logout() {
       state = LoginState.InActive
   }
}
```

### Chain Of Responsibility Pattern

Chain of responsibility pattern is a part of behavioural pattern which holds the chain of requests, each request can handle immediately or pass the request to another. Here is an example of the pattern in Kotlin:

```kotlin
fun main() {
   val ceoRequestHandler = CEORequestHandler()
   val managerRequestHandler = ManagerRequestHandler()
   val developerRequestHandler = DeveloperRequestHandler()

   ceoRequestHandler.setNextRequest(managerRequestHandler)
   managerRequestHandler.setNextRequest(developerRequestHandler)

   ceoRequestHandler.handleRequest(1)
}

private abstract class Handler {
   private var _nextRequest: Handler? = null
   val nextRequest: Handler? get() = _nextRequest

   fun setNextRequest(request: Handler) {
       _nextRequest = request
   }

   abstract fun handleRequest(amount: Int)
}

private class CEORequestHandler() : Handler() {
   override fun handleRequest(amount: Int) {
       if (amount == 1) {
           println("ceo handled")
       } else {
           nextRequest?.handleRequest(amount)
       }
   }
}

private class ManagerRequestHandler() : Handler() {
   override fun handleRequest(amount: Int) {
       if (amount == 2) {
           println("manager handled")
       } else {
           nextRequest?.handleRequest(amount)
       }
   }
}

private class DeveloperRequestHandler() : Handler() {
   override fun handleRequest(amount: Int) {
       if (amount == 3) {
           println("developer handled")
       } else {
           nextRequest?.handleRequest(amount)
       }
   }
}
```

### Visitor Pattern

Visitor pattern is a behavioural pattern which is used in some scenarios where you need to perform some operations or actions on objects without modifying them. Here is an example of the pattern in Kotlin:

```kotlin
fun main() {
   val heading = Heading()
   val subtitle = Subtitle()
   val document = setOf(heading, subtitle)
  
   val exportToPdfVisitor = ExportToPdfVisitor()
   val exportToCsvVisitor = ExportToCsvVisitor()
  
   document.forEach {
       it.accept(exportToCsvVisitor)
       it.accept(exportToPdfVisitor)
   }
}

private interface Element {
   fun accept(visitor: Visitor)
}

private interface Visitor {
   fun visit(element: Element)
}

private class ExportToPdfVisitor: Visitor {
   override fun visit(element: Element) {
       //export to pdf
   }
}

private class ExportToCsvVisitor: Visitor {
   override fun visit(element: Element) {
       //export to csv
   }
}

private class Heading: Element {
   override fun accept(visitor: Visitor) {
       visitor.visit(this)
   }
}

private class Subtitle: Element {
   override fun accept(visitor: Visitor) {
       visitor.visit(this)
   }
}
```

### Mediator Pattern

Mediator pattern is a simpliest behavioural pattern used to make communication between multiple objects. Here is an example of the pattern in Kotlin:

```kotlin
fun main() {
   val message = ""
   val mediator = ChatMediator()
   mediator.sendMessage(message)
}

private interface Mediator

private class ChatMediator: Mediator {
   fun sendMessage(msg: String) {
       // Implementation
   }
}
```

### Memento Pattern

Memento pattern is a behavioural pattern which is used to save and restore state. Here is an example of the pattern in Kotlin:

```kotlin
fun main() {
   val state = State(id = "", name = "")
   val memento = Memento()

   // save the state
   memento.save(state)
   // restore the state
   memento.restore(state.id)
}

private data class State(val id: String, val name: String)

private interface Store {
   fun save(save: State)
   fun restore(id: String): State?
}

private class Memento: Store {
   private val states = hashMapOf<String, State>()
   
   override fun save(save: State) {
       states[save.id] = save
   }

   override fun restore(id: String): State? {
       return states[id]
   }
}
```

## Creational Patterns

Creational patterns are used to control the creation of objects. They are used to abstract the instantiation process and provide a consistent interface for creating objects. There are several creational patterns that can be used to deal with creational behaviours, including the Abstract Factory Pattern, the Factory Method Pattern, the Singleton Pattern, and the Prototype Pattern.

### Builder Pattern

The builder pattern is a design pattern that allows you to create complex objects step-by-step. It is often used when you need to create objects with a lot of different properties. In Android, Dialog used the same builder pattern for the creation of android dialog. Here is an example of the builder pattern in Kotlin:

```kotlin
fun main() {
   val dialog = Dialog.Builder().build()
}

class Dialog private constructor(
   private val title: String,
   private val message: String
) {
   class Builder constructor() {
       private var title: String = ""
       private var message: String = ""
      
       fun setTitle(title: String) {
           this.title = title
       }
      
       fun setMessage(message: String) {
           this.message = message
       }
      
       fun build(): Dialog {
           return Dialog(
               title = title,
               message = message
           )
       }
   }
}
```

### Factory Pattern

The factory pattern is a software design pattern that creates objects without specifying the exact class of the object that will be created. This can be useful when you need to create objects of different types depending on certain conditions. Often, Factory pattern also used for creating objects without linked with interface. Here is the example of design pattern:

```kotlin
fun main() {
   val company = CompanyFactory().create(11)
}

interface Company
class Google: Company
class Amazon: Company

class CompanyFactory {
   fun create(rating: Int): Company {
       return if(rating > 10) Google()
       else Amazon()
   }
}
```

### Singleton Pattern

Singleton pattern is a creational pattern which is used to create the object of the same instance, can have multiple references. Often, In Android Development, Singleton used for such use cases that exists throughout the application lifecycle. For example — If you need to share Colors, Fonts in UI, It doesn't make sense to create multiple object of same class without changing the internal logic or execution. Here is the example of design pattern:

```kotlin
fun main() {
   val payment = Payment.make()
}

object Payment {
   fun make() {
       // Implementation
   }
}
```

## Structural Pattern

In Kotlin, a structural pattern is a design pattern that focuses on the object's structure rather than its behaviour. This means that the pattern can be applied to any object, regardless of its class or interface. One example of a structural pattern is the Adapter pattern. The Adapter pattern allows you to use objects that have different interfaces with each other. For example, you could use the Adapter pattern to connect a Java object with a Kotlin object.

### Adapter Pattern

The adapter pattern is a structural design pattern that allows two or more incompatible interfaces to work together. It does this by providing a wrapper class that implements the interfaces in question and translates the calls between them. This can be useful when you need to use an existing class that does not have the desired interface, or when you need to connect two classes that have incompatible interfaces. Here is the example of design pattern:

```kotlin
private interface Payment
class GooglePayment: Payment
class PhonePePayment: Payment
```

### Decorator Pattern

The Decorator pattern is a structural design pattern that allows you to add new functionality to an existing object without modifying the object's original code. This is done by wrapping the original object in a new object that provides the additional functionality. The Decorator pattern is often used to add logging, auditing, or security features to objects. Here is the example of design pattern:

```kotlin
fun main() {
   val coffee = ExpressCoffee()
   val milkCoffee = Milk(coffee)
   milkCoffee.getCost()
}

interface Coffee {
   fun getCost(): Int
}

class NormalCoffee: Coffee {
   override fun getCost(): Int {
       return 1
   }
}

class ExpressCoffee: Coffee {
   override fun getCost(): Int {
       return 2
   }
}

class Milk(private val coffee: Coffee): Coffee {
   override fun getCost(): Int {
       return 1 + coffee.getCost()
   }
}
```

### Facade Pattern

The Facade pattern is a structural design pattern that provides a simplified interface to a complex system. It hides the complexity of the system from the client and provides a single point of access to the system. This makes it easier for the client to use the system and also makes the system more maintainable.

The Facade pattern is often used when a system is composed of many different components or when the system is difficult to understand. It can also be used to improve the performance of a system by reducing the number of calls that need to be made to the system. Here is the example of design pattern:

```kotlin
private interface Product {
   fun sell()
}

private class Google: Product {
   override fun sell() {
       // Implementation
   }
}

private class Amazon: Product {
   override fun sell() {
       // Implementation
   }
}

private class Facade(private val google: Google, private val amazon: Amazon) {
   fun sell() {
       google.sell()
       google.sell()
   }
}
```

### Proxy & Composite Pattern

Proxy pattern is a structural pattern which is used to structure the object by using a proxy object. A composite pattern is used to represent the multiple objects by using the same naming or interface.

These patterns makes the code more testable and flexible. You might use these patterns in your repository, local or remote data source etc. Here is the example of design pattern: Here, `SecuredFile` is a proxy file, and `File` interface represents multiple objects or classes.

```kotlin
private interface File
private class NormalFile: File
private class SecuredFile: File
```

### Flyweight Pattern

The Flyweight pattern minimises the cost of object creation by using the factory design. You can use the pattern for increasing the performance of object creation in your application by implementing the simple flyweight pattern.

In the example below, the `ShapeFactory` is used to create an object from the cache if it already exists, or to create a new object if it does not. Here is the example of design pattern:

```kotlin
fun main() {
   val shape = ShapeFactory().create(1)
}

private interface Shape
private class Rectangle: Shape
private class Circle: Shape

private class ShapeFactory {
   private val cache = hashMapOf<Int, Shape>()
   
   fun create(size: Int): Shape {
       val cachedShape = cache[size]
       if(cachedShape != null) return cachedShape
      
       val shape = if(size == 1) Rectangle()
       else Circle()

       cache[size] = shape
       return shape
   }
}
```

Thanks for reading!








