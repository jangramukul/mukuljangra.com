---
title: "Bit Manipulation & Math"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 12
sequence: 52
description: "Bit manipulation shows up in interviews as a way to test your understanding of how numbers work at the binary level."
---

## Bit Manipulation & Math

Bit manipulation shows up in interviews to test your understanding of how numbers work at the binary level. These problems often have elegant O(1) or O(log n) solutions that feel almost like magic once you see them. Math-based questions -- GCD, primes, modular arithmetic -- appear less frequently but are expected at the senior level.

#### How does XOR help find a single number where every other number appears twice?

XOR is like a light switch with two toggles -- flipping the same switch twice brings you back to where you started. That's `a xor a = 0`. And XOR-ing anything with zero leaves it unchanged -- `a xor 0 = a`. So if you XOR every element in the array together, all the duplicates cancel each other out and you're left holding the one unique number. Time O(n), space O(1). This trick is so elegant it almost feels like cheating.

```kotlin
fun singleNumber(nums: IntArray): Int {
    var result = 0
    for (num in nums) result = result xor num
    return result
}
```

#### How do you check if a number is a power of two?

Here's a fun bit of binary trivia -- every power of two has exactly one bit set. 1 is `0001`, 2 is `0010`, 4 is `0100`, 8 is `1000`. See the pattern? Now, `n - 1` flips all the bits below that single set bit, so `n and (n - 1)` clears it completely. If the result is zero and n is positive, you've got a power of two. One line, O(1), done.

```kotlin
fun isPowerOfTwo(n: Int): Boolean {
    return n > 0 && (n and (n - 1)) == 0
}
```

#### How do you count the number of 1 bits (Hamming weight)?

The trick `n and (n - 1)` strips the lowest set bit every time. Think of it like popping bubbles -- each iteration pops exactly one, and you count how many pops it takes to get to zero. The beauty is that this runs in O(k) where k is the number of set bits, not 32 iterations every time. If only 3 bits are set, you loop 3 times.

```kotlin
fun hammingWeight(n: Int): Int {
    var num = n
    var count = 0
    while (num != 0) {
        num = num and (num - 1)
        count++
    }
    return count
}
```

#### How do you find the missing number in an array of 0 to n?

Same XOR trick, different costume. XOR all numbers from 0 to n together with all the array elements. Everything that appears twice cancels out, and the missing one is left standing. Time O(n), space O(1). You could also use the sum formula `n*(n+1)/2` and subtract, but that risks integer overflow on large inputs. XOR doesn't have that problem.

```kotlin
fun missingNumber(nums: IntArray): Int {
    var xor = nums.size
    for (i in nums.indices) {
        xor = xor xor i xor nums[i]
    }
    return xor
}
```

> **🧠 Think about it:** If you had *two* missing numbers instead of one, could XOR alone still solve it? What extra information would you need?

#### What are the basic bitwise operators?

Think of these as the building blocks -- every bit manipulation problem you'll ever see is built from these six operations.

- **AND (`and`)** -- Both bits must be 1. This is your masking tool -- it lets you extract specific bits while ignoring the rest
- **OR (`or`)** -- Either bit is 1. Use it when you want to set specific bits without disturbing others
- **XOR (`xor`)** -- Exactly one bit is 1. The Swiss army knife of bit manipulation -- toggling, finding unique elements, swapping values
- **NOT (`inv()`)** -- Flips every single bit. Turns 0s to 1s and 1s to 0s
- **Left shift (`shl`)** -- Shifts bits left, effectively multiplying by 2^n. Fast math without the multiply instruction
- **Right shift (`shr`)** -- Shifts bits right, dividing by 2^n. Kotlin also has `ushr` for unsigned right shift, which fills with zeros instead of copying the sign bit

#### How do you check, set, clear, and toggle a specific bit?

These four operations are the bread and butter of bit manipulation. Once you see this pattern, you can't unsee it -- every bit problem is some combination of these moves.

- **Check bit i**: `(n shr i) and 1` -- shift the target bit to position 0, then AND with 1 to isolate it
- **Set bit i**: `n or (1 shl i)` -- create a mask with just that bit, OR it in
- **Clear bit i**: `n and (1 shl i).inv()` -- create a mask with every bit *except* that one, AND it
- **Toggle bit i**: `n xor (1 shl i)` -- XOR flips the bit regardless of its current state

```kotlin
fun checkBit(n: Int, i: Int): Boolean = (n shr i) and 1 == 1
fun setBit(n: Int, i: Int): Int = n or (1 shl i)
fun clearBit(n: Int, i: Int): Int = n and (1 shl i).inv()
fun toggleBit(n: Int, i: Int): Int = n xor (1 shl i)
```

#### How do you find two non-repeating numbers where every other appears twice?

This one builds on the single number trick, but with a clever twist. XOR everything together and you get `a xor b`. That's useful, but you need to separate them. Here's the key insight -- since a and b are different, at least one bit in `a xor b` is set. That bit is where a and b disagree. Use `xorAll and -xorAll` to isolate the lowest such bit, then split all numbers into two groups based on that bit. XOR within each group, and each group gives you one of the two unique numbers.

```kotlin
fun singleNumbers(nums: IntArray): IntArray {
    var xorAll = 0
    for (num in nums) xorAll = xorAll xor num
    val diffBit = xorAll and (-xorAll)
    var a = 0
    var b = 0
    for (num in nums) {
        if (num and diffBit != 0) a = a xor num
        else b = b xor num
    }
    return intArrayOf(a, b)
}
```

#### How do you count total 1 bits for every number from 0 to n?

The naive approach would be to count bits for each number individually, but there's a slick DP relationship here. The number of set bits in `i` equals the number of set bits in `i / 2` (which is `i shr 1`) plus whether the last bit is set (`i and 1`). You're basically saying: "shift the number right, look up the answer you already computed, and add the bit you just shifted off." Time O(n), space O(n).

```kotlin
fun countBits(n: Int): IntArray {
    val result = IntArray(n + 1)
    for (i in 1..n) {
        result[i] = result[i shr 1] + (i and 1)
    }
    return result
}
```

> **🧠 Think about it:** Why does `result[i shr 1]` always reference an index we've already computed? What guarantees that `i shr 1` is always less than `i`?

#### What is bit masking for representing subsets?

Imagine you have a set of n items and you want to represent every possible subset. Instead of using arrays of arrays, you use a single integer where each bit is a yes/no vote for including that element. For 3 elements, you get 2^3 = 8 subsets, represented by integers 0 through 7. `000` means empty set, `101` means pick the first and third items. It's compact, fast to compare, and makes subset operations trivial -- union is OR, intersection is AND, complement is NOT.

```kotlin
fun generateSubsets(nums: IntArray): List<List<Int>> {
    val result = mutableListOf<List<Int>>()
    val n = nums.size
    for (mask in 0 until (1 shl n)) {
        val subset = mutableListOf<Int>()
        for (i in 0 until n) {
            if ((mask shr i) and 1 == 1) subset.add(nums[i])
        }
        result.add(subset)
    }
    return result
}
```

#### How do you compute GCD using Euclid's algorithm?

This algorithm is over 2,300 years old and it's still the best we've got. The idea is beautifully simple -- GCD(a, b) = GCD(b, a % b). You keep swapping and reducing until the remainder hits zero, and what's left is the GCD. It runs in O(log(min(a, b))), which is absurdly fast. For LCM, use the identity `LCM(a, b) = a / GCD(a, b) * b` -- divide first to avoid overflow.

```kotlin
fun gcd(a: Int, b: Int): Int {
    var x = a
    var y = b
    while (y != 0) {
        val temp = y
        y = x % y
        x = temp
    }
    return x
}

fun lcm(a: Int, b: Int): Int = a / gcd(a, b) * b
```

#### How does the Sieve of Eratosthenes work?

Picture a classroom of students numbered 2 through n, all standing. The teacher calls out 2, and every multiple of 2 sits down. Then 3 -- every multiple of 3 sits down. Then 5 (4 already sat down). You only need to call out numbers up to the square root of n, because any composite number larger than that has a factor that already got called. The students still standing at the end are the primes. Time O(n log log n) -- practically linear for any reasonable input.

```kotlin
fun sieveOfEratosthenes(n: Int): List<Int> {
    val isPrime = BooleanArray(n + 1) { it >= 2 }
    var i = 2
    while (i * i <= n) {
        if (isPrime[i]) {
            var j = i * i
            while (j <= n) {
                isPrime[j] = false
                j += i
            }
        }
        i++
    }
    return (2..n).filter { isPrime[it] }
}
```

#### How do you reverse the bits of a 32-bit integer?

Think of it like reading a word backwards, one letter at a time. Extract the rightmost bit from the input, push it onto the result from the left, then shift the input right to expose the next bit. Do this 32 times and you've mirrored the entire binary representation. Straightforward, O(32) which is O(1).

```kotlin
fun reverseBits(n: Int): Int {
    var input = n
    var result = 0
    for (i in 0 until 32) {
        result = (result shl 1) or (input and 1)
        input = input shr 1
    }
    return result
}
```

#### How do you find the Hamming distance between two integers?

Hamming distance is just a fancy name for "how many bits are different." XOR the two numbers -- every position where they disagree becomes a 1 in the result. Then count the set bits. That's it. Two operations chained together, both of which you already know.

```kotlin
fun hammingDistance(x: Int, y: Int): Int {
    var xor = x xor y
    var count = 0
    while (xor != 0) {
        xor = xor and (xor - 1)
        count++
    }
    return count
}
```

#### How do you add two integers without + or - operators?

This one's a classic that makes you think about what addition actually *is* at the hardware level. XOR gives you the sum without any carries -- it's like adding each column but ignoring the carry row. AND tells you where carries happen, and shifting left moves them to the right column. Keep repeating until there are no more carries to propagate. This is essentially what your CPU's adder circuit does.

```kotlin
fun getSum(a: Int, b: Int): Int {
    var x = a
    var y = b
    while (y != 0) {
        val carry = x and y
        x = x xor y
        y = carry shl 1
    }
    return x
}
```

> **🧠 Think about it:** What happens if both a and b are negative? Does this approach still work with two's complement representation?

#### How do you compute a^b mod m efficiently?

If you tried computing a^b first and then taking mod, you'd overflow before you could blink. Binary exponentiation is the way -- you square the base and halve the exponent on each step, taking mod at every multiplication to keep numbers small. When the exponent bit is odd, you fold the current base into the result. Time O(log b). This is the same algorithm used in cryptographic systems like RSA.

```kotlin
fun modPow(base: Long, exp: Long, mod: Long): Long {
    var result = 1L
    var b = base % mod
    var e = exp
    while (e > 0) {
        if (e % 2 == 1L) result = result * b % mod
        b = b * b % mod
        e /= 2
    }
    return result
}
```

#### What is modular arithmetic and why does it matter?

In competitive programming and interviews, numbers get big. Really big. Modular arithmetic keeps them from overflowing by wrapping everything around a modulus, usually 10^9 + 7 (a prime, which is important for division). The key properties you need to remember -- addition and multiplication distribute over mod: `(a + b) % m = ((a % m) + (b % m)) % m`, and the same goes for multiplication. Subtraction is trickier because you can go negative, so always add m before taking mod: `((a % m) - (b % m) + m) % m`. Division doesn't work directly -- you need the modular inverse, which you can compute with binary exponentiation since the modulus is prime.

#### How do you solve "single number" when one number appears once and others appear three times?

XOR won't save you here because three copies don't cancel to zero. Instead, think bit by bit. For each of the 32 bit positions, count how many numbers have that bit set. If the count is divisible by 3, the unique number has a 0 there. If not, it has a 1. You're essentially peeling away the triples one bit position at a time.

```kotlin
fun singleNumberII(nums: IntArray): Int {
    var result = 0
    for (bit in 0 until 32) {
        var count = 0
        for (num in nums) {
            if ((num shr bit) and 1 == 1) count++
        }
        if (count % 3 != 0) result = result or (1 shl bit)
    }
    return result
}
```

### Common Follow-ups

- How do you swap two numbers using XOR?
- What's the difference between arithmetic and logical right shift?
- How do you check if two integers have opposite signs using XOR?
- What's the time complexity of the Sieve and why isn't it O(n^2)?
- How does bitmask DP work for traveling salesman?
- How do you find the only number appearing an odd number of times?
- Can you solve single number III without bit counting per position?
