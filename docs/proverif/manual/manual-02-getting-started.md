# Chapter 2: Getting started

This chapter provides a basic introduction to ProVerif and is aimed at new users; experienced users may choose to skip this chapter. ProVerif is a command-line tool which can be executed using the syntax:

```
./proverif [options] <filename>
```

where `./proverif` is ProVerif's binary; `<filename>` is the input file; and command-line parameters `[options]` will be discussed later (Section 6.6.1). ProVerif can handle input files encoded in several languages. The typed pi calculus is currently considered to be state-of-the-art and files of this sort are denoted by the file extension `.pv`. This manual will focus on protocols encoded in the typed pi calculus. (For the interested reader, other input formats are mentioned in Section 6.6.1 and in `docs/manual-untyped.pdf`.) The pi calculus is designed for representing concurrent processes that interact using communications channels such as the Internet.

ProVerif is capable of proving reachability properties, correspondence assertions, and observational equivalence. This chapter will demonstrate the use of reachability properties and correspondence assertions in a very basic manner. The true power of ProVerif will be discussed in the remainder of this manual.

## Reachability properties

Let us consider the ProVerif script:

```proverif
 1  (* hello.pv: Hello World Script *)
 2
 3  free c:channel.
 4
 5  free Cocks: bitstring [private].
 6  free RSA: bitstring [private].
 7  query attacker(RSA).
 8  query attacker(Cocks).
 9
10  process
11     out(c,RSA);
12     0
```

Line 1 contains the comment "hello.pv: Hello World Script"; comments are enclosed by `(* comment *)`. Line 3 declares the free name `c` of type `channel` which will later be used for public channel communication. Lines 5 and 6 declare the free names `Cocks` and `RSA` of type `bitstring`; the keyword `[private]` excludes the names from the attacker's knowledge. Line 10 declares the start of the main process. Line 11 outputs the name `RSA` on the channel `c`. Finally, the termination of the process is denoted by `0` on Line 12.

Names may be of any type, but we explicitly distinguish names of type `channel` from other types, since the former may be used as a communications channel for message input/output. The concept of bound and free names is similar to local and global scope in programming languages; that is, free names are globally known, whereas bound names are local to a process. By default, free names are known by the attacker. Free names that are not known by the attacker must be declared private with the addition of the keyword `[private]`. The message output on Line 11 is broadcast using a public channel because the channel name `c` is a free name; whereas, if `c` were a bound name or explicitly excluded from the attacker's knowledge, then the communication would be on a private channel. For convenience, the final line may be omitted and hence `out(c,RSA)` is an abbreviation of `out(c,RSA);0`.

Properties of the aforementioned script can be examined using ProVerif. For example, to test as to whether the names `Cocks` and `RSA` are derivable by the attacker, the following lines can be included before the main process:

```proverif
 7  query attacker(RSA).
 8  query attacker(Cocks).
```

Internally, ProVerif attempts to prove that a state in which the names `Cocks` and `RSA` are known to the attacker is unreachable (that is, it tests the queries `not attacker(RSA)` and `not attacker(Cocks)`, and these queries are true when the names are not derivable by the attacker). This makes ProVerif suitable for proving the secrecy of terms in a protocol.

Executing ProVerif (`./proverif docs/hello.pv`) produces the output:

```
Process 0 (that is, the initial process):
{1}out(c, RSA)
-- Query not attacker(RSA[]) in process 0.
Translating the process into Horn clauses...
Completing...
Starting query not attacker(RSA[])
goal reachable: attacker(RSA[])
Derivation:
1. The message RSA[] may be sent to the attacker at output {1}.
attacker(RSA[]).
2. By 1, attacker(RSA[]).
The goal is reached, represented in the following fact:
attacker(RSA[]).
A more detailed output of the traces is available with
  set traceDisplay = long.
out(c, ~M) with ~M = RSA at {1}
The attacker has the message ~M = RSA.
A trace has been found.
RESULT not attacker(RSA[]) is false.
-- Query not attacker(Cocks[]) in process 0.
Translating the process into Horn clauses...
Completing...
Starting query not attacker(Cocks[])
RESULT not attacker(Cocks[]) is true.
--------------------------------------------------------------
Verification summary:
Query not attacker(RSA[]) is false.
Query not attacker(Cocks[]) is true.
--------------------------------------------------------------
```

As can be interpreted from `RESULT not attacker(Cocks[]) is true`, the attacker has not been able to obtain the free name `Cocks`. The attacker has, however, been able to obtain the free name `RSA` as denoted by `RESULT not attacker(RSA[]) is false`. ProVerif is also able to provide an attack trace. In this instance, the trace is very short and denoted by

```
out(c, ~M) with ~M = RSA at {1}
The attacker has the message ~M = RSA.
```

which means that the name `RSA` is output on channel `c` at point `{1}` in the process and stored by the attacker in `~M`, where point `{1}` is annotated on Line 2 of the output. ProVerif concludes the trace by saying that the attacker has `RSA`. ProVerif also provides an English language description of the derivation denoted by

```
1. The message RSA[] may be sent to the attacker at output {1}.
attacker(RSA[]).
2. By 1, attacker(RSA[]).
The goal is reached, represented in the following fact:
attacker(RSA[]).
```

A derivation is the ProVerif internal representation of how the attacker may break the desired property, here may obtain `RSA`. It generally corresponds to an attack as in the example above, but may sometimes correspond to a false attack because of the internal approximations made by ProVerif. In contrast, when ProVerif presents a trace, it always corresponds to a real attack. See Section 3.3 for more details. The output ends with a summary of the results for all queries.

## Correspondence assertions

Let us now consider an extended variant `docs/hello_ext.pv` of the script:

```proverif
 1  (* hello_ext.pv: Hello Extended World Script *)
 2
 3  free c:channel.
 4
 5  free Cocks: bitstring [private].
 6  free RSA: bitstring [private].
 7
 8  event evCocks.
 9  event evRSA.
10
11  query event(evCocks) ==> event(evRSA).
12
13  process
14     out(c,RSA);
15     in(c,x: bitstring);
16     if x = Cocks then
17         event evCocks;
18         event evRSA
19     else
20         event evRSA
```

Lines 1-7 should be familiar. Lines 8-9 declare events `evCocks` and `evRSA`. Intuition suggests that Line 11 is some form of query. Lines 13-14 should again be standard. Line 15 contains a message input of type `bitstring` on channel `c` which it binds to the variable `x`. Lines 16-20 denote an if-then-else statement; the body of the then branch can be found on Lines 17-18 and the else branch on Line 20. We remark that the code presented is a shorthand for the more verbose

```proverif
if x = Cocks then event evCocks; event evRSA; 0 else event evRSA; 0
```

where `0` denotes the end of a branch (termination of a process). The statement `event evCocks` (similarly `event evRSA`) declares an event and the query

```proverif
query event(evCocks) ==> event(evRSA)
```

is true if and only if, for all executions of the protocol, if the event `evCocks` has been executed, then the event `evRSA` has also been executed before. Executing the script produces the output:

```
Process 0 (that is, the initial process):
{1}out(c, RSA);
{2}in(c, x: bitstring);
{3}if (x = Cocks) then
  {4}event evCocks;
  {5}event evRSA
else
  {6}event evRSA
-- Query event(evCocks) ==> event(evRSA) in process 0.
Translating the process into Horn clauses...
Completing...
Starting query event(evCocks) ==> event(evRSA)
RESULT event(evCocks) ==> event(evRSA) is true.
--------------------------------------------------------------
Verification summary:
Query event(evCocks) ==> event(evRSA) is true.
--------------------------------------------------------------
```

As expected, it is not possible to witness the event `evCocks` without having previously executed the event `evRSA` and hence the correspondence `event(evCocks) ==> event(evRSA)` is true. In fact, a stronger property is true: the event `evCocks` is unreachable. The reader can verify this claim with the addition of `query event(evCocks)`. (The authors remark that writing code with unreachable points is a common source of errors for new users. Advice on avoiding such pitfalls will be presented in Section 4.3.1.)
