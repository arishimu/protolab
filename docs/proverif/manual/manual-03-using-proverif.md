# Chapter 3: Using ProVerif

The primary goal of ProVerif is the verification of cryptographic protocols. Cryptographic protocols are concurrent programs which interact using public communication channels such as the Internet to achieve some security-related objective. These channels are assumed to be controlled by a very powerful environment which captures an attacker with "Dolev-Yao" capabilities [DY83]. Since the attacker has complete control of the communication channels, the attacker may: read, modify, delete, and inject messages. The attacker is also able to manipulate data, for example: compute the ith element of a tuple; and decrypt messages if it has the necessary keys. The environment also captures the behavior of dishonest participants; it follows that only honest participants need to be modeled. ProVerif's input language allows such cryptographic protocols and associated security objectives to be encoded in a formal manner, allowing ProVerif to automatically verify claimed security properties. Cryptography is assumed to be perfect; that is, the attacker is only able to perform cryptographic operations when in possession of the required keys. In other words, it cannot apply any polynomial-time algorithm, but is restricted to apply only the cryptographic primitives specified by the user. The relationships between cryptographic primitives are captured using rewrite rules and/or an equational theory.

In this chapter, we demonstrate how to use ProVerif for verifying cryptographic protocols, by considering a naïve handshake protocol (Figure 3.1) as an example. Section 3.1 discusses how cryptographic protocols are encoded within ProVerif's input language, a variant of the applied pi calculus [AF01, RS11] which supports types; Section 3.2 shows the security properties that can be proved by ProVerif; and Section 3.3 explains how to understand ProVerif's output.

## 3.1 Modeling protocols

A ProVerif model of a protocol, written in the tool's input language (the typed pi calculus), can be divided into three parts. The declarations formalize the behavior of cryptographic primitives (Section 3.1.1); and their use is demonstrated on the handshake protocol (Section 3.1.2). Process macros (Section 3.1.3) allow sub-processes to be defined, in order to ease development; and finally, the protocol itself can be encoded as a main process (Section 3.1.4), with the use of macros.

### 3.1.1 Declarations

Processes are equipped with a finite set of types, free names, and constructors (function symbols) which are associated with a finite set of destructors. The language is strongly typed and user-defined types are declared as

```proverif
type t.
```

All free names appearing within an input file must be declared using the syntax

```proverif
free n:t.
```

where n is a name and t is its type. Several free names of the same type t can be declared by

```proverif
free n1,...,nk : t.
```

**Figure 3.1 — Handshake protocol.**

A naïve handshake protocol between client A and server B is illustrated below. It is assumed that each principal has a public/private key pair, and that the client A knows the server B's public key pk(skB). The aim of the protocol is for the client A to share the secret s with the server B. The protocol proceeds as follows. On request from a client A, server B generates a fresh symmetric key k (session key), pairs it with his identity (public key pk(skB)), signs it with his secret key skB and encrypts it using his client's public key pk(skA). That is, the server sends the message aenc(sign((pk(skB),k),skB),pk(skA)). When A receives this message, she decrypts it using her secret key skA, verifies the digital signature made by B using his public key pk(skB), and extracts the session key k. A uses this key to symmetrically encrypt the secret s. The rationale behind the protocol is that A receives the signature asymmetrically encrypted with her public key and hence she should be the only one able to decrypt its content. Moreover, the digital signature should ensure that B is the originator of the message. The messages sent are illustrated as follows:

```
A → B : pk(skA)
B → A : aenc(sign((pk(skB),k),skB),pk(skA))
A → B : senc(s,k)
```

Note that protocol narrations (as above) are useful, but lack clarity. For example, they do not specify any checks which should be made by the participants during the execution of the protocol. Such checks include verifying digital signatures and ensuring that encrypted messages are correctly formed. Failure of these checks typically results in the participant aborting the protocol. These details will be explicitly stated when protocols are encoded for ProVerif. (For further discussion on protocol specification, see [AN96, Aba00].)

Informally, the three properties we would like this protocol to provide are:

1. Secrecy: the value s is known only to A and B.
2. Authentication of A to B: if B reaches the end of the protocol and he believes he has shared the key k with A, then A was indeed his interlocutor and she has shared k.
3. Authentication of B to A: if A reaches the end of the protocol with shared key k, then B proposed k for use by A.

However, the protocol is vulnerable to a man-in-the-middle attack (illustrated below). If a dishonest participant I starts a session with B, then I is able to impersonate B in a subsequent session the client A starts with B. At the end of the protocol, A believes that she shares the secret s with B, while she actually shares s with I.

```
I  → B : pk(skI)
B → I : aenc(sign((pk(skB),k),skB),pk(skI))
A → B : pk(skA)
I  → A : aenc(sign((pk(skB),k),skB),pk(skA))
A → B : senc(s,k)
```

The protocol can easily be corrected by adding the identity of the intended client:

```
A → B : pk(skA)
B → A : aenc(sign((pk(skA),pk(skB),k),skB),pk(skA))
A → B : senc(s,k)
```

With this correction, I is not able to re-use the signed key from B in her session with A.

The syntax `channel c.` is a synonym for `free c: channel`. By default, free names are known by the attacker. Free names that are not known by the attacker must be declared private:

```proverif
free n:t [private].
```

Constructors (function symbols) are used to build terms modeling primitives used by cryptographic protocols; for example: one-way hash functions, encryptions, and digital signatures. Constructors are defined by

```proverif
fun f(t1,...,tn) : t.
```

where f is a constructor of arity n, t is its return type, and t1,...,tn are the types of its arguments. Constructors are available to the attacker unless they are declared private:

```proverif
fun f(t1,...,tn) : t [private].
```

Private constructors can be useful for modeling tables of keys stored by the server (see Section 6.7.3), for example.

The relationships between cryptographic primitives are captured by destructors which are used to manipulate terms formed by constructors. Destructors are modeled using rewrite rules of the form:

```proverif
reduc forall x1,1 : t1,1, . . . , x1,n1 : t1,n1; g(M1,1, . . . , M1,k) = M1,0;
    . . .
    forall xm,1 : tm,1, . . . , xm,nm : tm,nm; g(Mm,1, . . . , Mm,k) = Mm,0.
```

where g is a destructor of arity k. The terms M1,1, . . . , M1,k, M1,0 are built from the application of constructors to variables x1,1, . . . , x1,n1 of types t1,1, . . . , t1,n1 respectively (and similarly for the other rewrite rules). The return type of g is the type M1,0 and M1,0,...,Mm,0 must have the same type. We similarly require that the arguments of the destructor have the same type; that is, M1,1, . . . , M1,k have the same types as Mi,1, . . . , Mi,k for i ∈ [2,m], and these types are the types of the arguments of g. When the term g(M1,1,...,M1,k) (or an instance of that term) is encountered during execution, it is replaced by M1,0, and similarly for the other rewrite rules. When no rule can be applied, the destructor fails, and the process blocks (except for the let process, see Section 3.1.4). This behavior corresponds to real world application of cryptographic primitives which include sufficient redundancy to detect scenarios in which an operation fails. For example, in practice, encrypted messages may be assumed to come with sufficient redundancy to discover when the 'wrong' key is used for decryption. It follows that destructors capture the behavior of cryptographic primitives which can visibly fail.

When several variables have the same type, we can avoid repeating their type in the declaration, writing for instance:

```proverif
reduc forall x,y : t,z : t′; g(M1,...,Mk) = M0.
```

Destructors must be deterministic, that is, for each terms (M1,...,Mk) given as argument to g, when several rewrite rules apply, they must all yield the same result and, in the rewrite rules, the variables that occur in Mi,0 must also occur in Mi,1,...,Mi,k, so that the result of g(M1,...,Mk) is entirely determined.

In a similar manner to constructors, destructors may be declared private by appending [private]. The generic mechanism by which primitives are encoded permits the modeling of various cryptographic operators.

It is possible to use let bindings within the declaration of each rewrite rule. For example, an abstract zero knowledge proof used in some voting protocols could be declared as follows:

```proverif
reduc forall r:rand, i:id, v:vote, pub: public key;
     let cipher = raenc(v,r,pub) in
     checkzkp(zkp(r,i,v,cipher), i, cipher) = ok.
```

### 3.1.2 Example: Declaring cryptographic primitives for the handshake protocol

We now formalize the basic cryptographic primitives used by the handshake protocol.

**Symmetric encryption.** For symmetric encryption, we define the type key and consider the binary constructor senc which takes arguments of type bitstring, key and returns a bitstring.

```proverif
1   type key.
2
3   fun senc(bitstring, key): bitstring.
```

Note that the type bitstring is built-in, and hence, need not be declared as a user-defined type. The type key is not built-in and hence we declare it on Line 1. To model the decryption operation, we introduce the destructor:

```proverif
4   reduc forall m: bitstring, k: key; sdec(senc(m,k),k) = m.
```

where m represents the message and k represents the symmetric key.

**Asymmetric encryption.** For asymmetric cryptography, we consider the unary constructor pk, which takes an argument of type skey (private key) and returns a pkey (public key), to capture the notion of constructing a key pair. Decryption is captured in a similar manner to symmetric cryptography with a public/private key pair used in place of a symmetric key.

```proverif
5   type skey.
6   type pkey.
7
8   fun pk(skey): pkey.
9   fun aenc(bitstring, pkey): bitstring.
10
11  reduc forall m: bitstring, k: skey; adec(aenc(m, pk(k)), k) = m.
```

**Digital signatures.** In a similar manner to asymmetric encryption, digital signatures rely on a pair of signing keys of types sskey (private signing key) and spkey (public signing key). We will consider digital signatures with message recovery:

```proverif
12  type sskey.
13  type spkey.
14
15  fun spk(sskey): spkey.
16  fun sign(bitstring, sskey): bitstring.
17
18  reduc forall m: bitstring, k: sskey; getmess(sign(m,k)) = m.
19  reduc forall m: bitstring, k: sskey; checksign(sign(m,k),spk(k)) = m.
```

The constructors spk, for creating public keys, and sign, for constructing signatures, are standard. The destructors permit message recovery and signature verification. The destructor getmess allows the attacker to get the message m from the signature, even without having the key. The destructor checksign checks the signature, and returns m only when the signature is correct. Honest processes typically use only checksign. This model of signatures assumes that the signature is always accompanied with the message m. It is also possible to model signatures that do not reveal the message m, see Section 4.2.5.

**Tuples and typing.** For convenience, ProVerif has built-in support for tupling. A tuple of length n > 1 is defined as (M1,...,Mn) where M1,...,Mn are terms of any type. Once in possession of a tuple, the attacker has the ability to recover the ith element. The inverse is also true: if the attacker is in possession of terms M1,...,Mn, then it can construct the tuple (M1,...,Mn). Tuples are always of type bitstring. Accordingly, constructors that take arguments of type bitstring may be applied to tuples. Note that the term (M) is not a tuple and is equivalent to M. (Parentheses are needed to override the default precedence of infix operators.) It follows that (M) and M have the same type and that tuples of arity one do not exist.

### 3.1.3 Process macros

To facilitate development, protocols need not be encoded into a single main process (as we did in Chapter 2). Instead, sub-processes may be specified in the declarations using macros of the form

```proverif
let R(x1 : t1,...,xn : tn) = P.
```

where R is the macro name, P is the sub-process being defined, and x1,...,xn, of types t1,...,tn respectively, are the free variables of P. The macro expansion R(M1,...,Mn) will then expand to P with M1 substituted for x1, ..., Mn substituted for xn. As an example, consider a variant docs/hello var.pv of docs/hello.pv (previously presented in Chapter 2):

```proverif
free c:channel.
free Cocks: bitstring [private].
free RSA: bitstring [private].
query attacker(Cocks).
let R(x: bitstring) = out(c,x);0.
let R'(y: bitstring) = 0.
process R(RSA) | R'(Cocks)
```

By inspection of ProVerif's output (see Section 3.3 for details on ProVerif's output), one can observe that this process is identical to the one in which the macro definitions are omitted and are instead expanded upon in the main process. It follows immediately that macros are only an encoding which we find particularly useful for development.

### 3.1.4 Processes

The basic grammar of the language is presented in Figure 3.2; advanced features will be discussed in Chapter 4; and the complete grammar is presented in Appendix A for reference.

Terms M,N consist of names a,b,c,k,m,n,s; variables x,y,z; tuples (M1,...,Mj) where j is the arity of the tuple; and constructor/destructor application, denoted h(M1,...,Mk) where k is the arity of h and arguments M1,...,Mk have the required types. Some functions use the infix notation: M = N for equality, M <> N for disequality (both equality and disequality work modulo an equational theory; they take two arguments of the same type and return a result of type bool), M && M for the boolean conjunction, M || M for the boolean disjunction. We use not(M) for the boolean negation. In boolean operations, all values different from true (modulo an equational theory) are considered as false. Furthermore, if the first argument of M && M is not true, then the second argument is not evaluated and the result is false. Similarly, if the first argument of M || M is true, then the second argument is not evaluated and the result is true.

Processes P,Q are defined as follows. The null process 0 does nothing; P | Q is the parallel composition of processes P and Q, used to represent participants of a protocol running in parallel; and the replication !P is the infinite composition P | P | ..., which is often used to capture an unbounded number of sessions. Name restriction new n : t; P binds name n of type t inside P, the introduction of restricted names (or private names) is useful to capture both fresh random numbers (modeling nonces and keys, for example) and private channels. Communication is captured by message input and message output. The process in(M,x : t); P awaits a message of type t from channel M and then behaves as P with the received message bound to the variable x; that is, every free occurrence of x in P refers to the message received. The process out(M,N); P is ready to send N on channel M and then run P. In both of these cases, we may omit P when it is 0. The conditional if M then P else Q is standard: it runs P when the boolean term M evaluates to true, it runs Q when M evaluates to some other value. It executes nothing when the term M fails (for instance, when M contains a destructor for which no rewrite rule applies). For example, if M = N then P else Q tests equality of M and N. For convenience, conditionals may be abbreviated as if M then P when Q is the null process. The power of destructors can be capitalized upon by let x = M in P else Q statements where M may contain destructors.

**Figure 3.2 — Term and process grammar.**

```
M,N ::=                       terms
  a,b,c,k,m,n,s                 names
  x,y,z                         variables
  (M1,...,Mk)                   tuple
  h(M1,...,Mk)                  constructor/destructor application
  M=N                           term equality
  M<>N                          term disequality
  M&&M                          conjunction
  M||M                          disjunction
  not(M)                        negation

P,Q ::=                       processes
  0                             null process
  P | Q                         parallel composition
  !P                            replication
  new n:t; P                    name restriction
  in(M,x:t); P                  message input
  out(M,N); P                   message output
  if M then P else Q            conditional
  let x = M in P else Q         term evaluation
  R(M1,...,Mk)                  macro usage
```

**Figure 3.3 — Pattern matching grammar.**

```
T ::=                         patterns
  x:t                           typed variable
  x                             variable without explicit type
  _ : t                         unnamed typed variable
  _                             unnamed variable without explicit type
  (T1,...,Tn)                   tuple
  =M                            equality test
```

When this statement is encountered during process execution, there are two possible outcomes. If the term M does not fail (that is, for all destructors in M, matching rewrite rules exist), then x is bound to M and the P branch is taken; otherwise (rather than blocking), the Q branch is taken. (In particular, when M never fails, the P branch will always be executed with x bound to M.) For convenience, the statement let x = M in P else Q may be abbreviated as let x = M in P when Q is the null process. Finally, we have R(M1,...,Mn), denoting the use of the macro R with terms M1,...,Mn as arguments.

#### Pattern matching

For convenience, ProVerif supports pattern matching and we extend the grammar to include patterns (Figure 3.3). The variable pattern x : t matches any term of type t and binds the matched term to x. The variable pattern x is similar, but can be used only when the type of x can be inferred from the context. When the matched term is not used, the variable can be replaced with the symbol _, which matches any term (of a certain type) without binding the matched term to a variable. The tuple pattern (T1,...,Tn) matches tuples (M1,...,Mn) where each component Mi (i ∈ {1,...,n}) is recursively matched with Ti. Finally, the pattern =M matches terms N where M = N. (This is equivalent to an equality test.)

To make use of patterns, the grammar for processes is modified. We omit the rule in(M,x : t); P and instead consider in(M,T); P which awaits a message matching the pattern T and then behaves as P with the free variables of T bound inside P. Similarly, we replace let x = M in P else Q with the more general let T = M in P else Q. (Note that let x = M in P else Q is a particular case in which the type of x is inferred from M; users may also write let x : t = M in P else Q where t is the type of M, ProVerif will produce an error if there is a type mismatch.)

#### Scope and binding

Bracketing must be used to avoid ambiguities in the way processes are written down. For example, the process !P | Q might be interpreted as !(P | Q), or as (!P) | Q. These processes are different. To avoid too much bracketing, we adopt conventions about the precedence of process operators. The binary parallel process P | Q binds most closely; followed by the binary processes if M then P else Q, let x = M in P else Q; finally, unary processes bind least closely. It follows that !P | Q is interpreted as !(P | Q). Users should pay particular attention to ProVerif warning messages since these typically arise from misunderstanding ProVerif's binding conventions. For example, consider the process

```proverif
new n:t; out(c,n) | new n:t; in(c,x:t); 0 | if x = n then 0 | out(c,n)
```

which produces the message "Warning: identifier n rebound." Moreover, the process will never perform the final out(c,n) because the process is bracketed as follows:

```proverif
new n:t;(out(c,n) | new n:t; (in(c,x:t); 0 | if x = n then (0 | out(c,n))))
```

and hence the final output is guarded by a conditional which can never be satisfied. The authors recommend the distinct naming of names and variables to avoid confusion. New users may like to refer to the output produced by ProVerif to ensure that they have defined processes correctly (see also Section 3.3). Another possible ambiguity arises because of the convention of omitting else 0 in the if-then-else construct (and similarly for let-in-else): it is not clear which if the else applies to in the expression:

```proverif
if M = M′ then if N = N′ then P else Q
```

In this instance, we adopt the convention that the else branch belongs to the closest if and hence the statement should be interpreted as if M = M′ then (if N = N′ then P else Q). The convention is similar for let-in-else.

#### Remarks about syntax

The restrictions on identifiers (Figure 3.2) for constructors/destructors h, names a,b,c,k,m,n,s, types t, and variables x,y,z are completely relaxed. Formally, we do not distinguish between identifiers and let identifiers range over an unlimited sequence of letters (a-z, A-Z), digits (0-9), underscores (_), single-quotes ('), and accented letters from the ISO Latin 1 character set where the first character of the identifier is a letter and the identifier is distinct from the reserved words. Note that identifiers are case sensitive. Comments can be included in input files and are surrounded by (* and *). Nested comments are supported.

#### Reserved words

The following is a list of keywords in the ProVerif language; accordingly, they cannot be used as identifiers.

among, axiom, channel, choice, clauses, const, def, diff, do, elimtrue, else, equation, equivalence, event, expand, fail, for, forall, foreach, free, fun, get, if, implementation, in, inj-event, insert, lemma, let, letfun, letproba, new, noninterf, noselect, not, nounif, or, otherwise, out, param, phase, pred, proba, process, proof, public vars, putbegin, query, reduc, restriction, secret, select, set, suchthat, sync, table, then, type, weaksecret, yield.

ProVerif also has built-in types any, bitstring, bool, nat, sid, time, constants true, false of type bool, destructor is nat, predicates attacker, mess, subterm; although these identifiers can be reused as identifiers, the authors strongly discourage this practice.

### 3.1.5 Example: handshake protocol

We are now ready to present an encoding of the handshake protocol, available in docs/ex handshake.pv (for brevity, we omit function/type declarations and destructors, for details see Section 3.1.1):

```proverif
1  free c:channel.
2
3  free s: bitstring [private].
4  query attacker(s).
5
6  let clientA(pkA:pkey, skA:skey, pkB:spkey) =
7    out(c,pkA);
8    in(c,x: bitstring);
9    let y = adec(x,skA) in
10   let (=pkB,k:key) = checksign(y,pkB) in
11   out(c,senc(s,k)).
12
13 let serverB(pkB:spkey, skB:sskey) =
14   in(c,pkX:pkey);
15   new k:key;
16   out(c,aenc(sign((pkB,k),skB),pkX));
17   in(c,x: bitstring);
18   let z = sdec(x,k) in
19   0.
20
21 process
22   new skA:skey;
23   new skB:sskey;
24   let pkA = pk(skA) in out(c,pkA);
25   let pkB = spk(skB) in out(c,pkB);
26   ( (!clientA(pkA,skA,pkB)) | (!serverB(pkB,skB)) )
```

The first line declares the public channel c. Lines 3-4 should be familiar from Chapter 2 and further details will be given in Section 3.2. The client process is defined by the macro starting on Line 6 and the server process is defined by the macro starting on Line 13. The main process generates the private asymmetric key skA and the private signing key skB for principals A, B respectively (Lines 22-23). The public key parts pk(skA), spk(skB) are derived and then output on the public communications channel c (Lines 24-25), ensuring that they are available to the attacker. (Observe that this is done using handles pkA, pkB for convenience.) The main process also instantiates multiple copies of the client and server macros with the relevant parameters representing multiple sessions of the roles.

We assume that the server B is willing to run the protocol with any other principal; the choice of her interlocutor will be made by the environment. This is captured by modeling the first input in(c,pkX:pkey) to serverB as his client's public key pkX (Line 14). The client A on the other hand only wishes to share his secret s with the server B; accordingly, B's public key is hard-coded into the process clientA. We additionally assume that each principal is willing to engage in an unbounded number of sessions and hence clientA(pkA,skA,pkB) and serverB(pkB,skB) are under replication.

The client and server processes correspond exactly to the description presented in Figure 3.1 and we will now describe the details of our encoding. On request from a client, server B starts the protocol by selecting a fresh key k and outputting aenc(sign((pkB,k),skB),pkX) (Line 16); that is, her signature on the key k paired with her identity spk(skB) and encrypted for his client using her public key pkX. Meanwhile, the client A awaits the input of his interlocutor's signature on the pair (pkB,k) encrypted using his public key (Line 8). A verifies that the ciphertext is correctly formed using the destructor adec on Line 9, which will visibly fail if x is not a message asymmetrically encrypted for the client; that is, the (omitted) else branch of the statement will be evaluated because there is no corresponding rewrite rule. The statement let (=pkB,k:key) = checksign(y,pkB) in on Line 10 uses destructors and pattern matching with type checking to verify that y is a signature under skB containing a pair, where the first element is the server's public signing key and the second is a symmetric key k. If y is not a correct signature, then the (omitted) else branch of the statement will be evaluated because there is no corresponding rewrite rule, so the client halts. Finally, the server inputs a bitstring x and recovers the cleartext as variable z. (Observe that the failure of decryption is again detectable.) Note that the variable z in the server process is not used.

## 3.2 Security properties

The ProVerif tool is able to prove reachability properties, correspondence assertions, and observational equivalence. In this section, we will demonstrate how to prove the security properties of the handshake protocol. A more complete coverage of the properties that ProVerif can prove is presented in Section 4.3.

### 3.2.1 Reachability and secrecy

Proving reachability properties is ProVerif's most basic capability. The tool allows the investigation of which terms are available to an attacker; and hence (syntactic) secrecy of terms can be evaluated with respect to a model. To test secrecy of the term M in the model, the following query is included in the input file before the main process:

```proverif
query attacker(M).
```

where M is a ground term, without destructors, containing free names (possibly private and hence not initially known to the attacker). We have already demonstrated the use of secrecy queries on our handshake protocol (see the code in Section 3.1.5).

### 3.2.2 Correspondence assertions, events, and authentication

Correspondence assertions [WL93] are used to capture relationships between events which can be expressed in the form "if an event e has been executed, then event e′ has been previously executed." Moreover, these events may contain arguments, which allow relationships between the arguments of events to be studied. To reason with correspondence assertions, we annotate processes with events, which mark important stages reached by the protocol but do not otherwise affect behavior. Accordingly, we extend the grammar for processes to include events denoted

```proverif
event e(M1,...,Mn); P
```

Importantly, the attacker's knowledge is not extended by the terms M1,...,Mn following the execution of event e(M1,...,Mn); hence, the execution of the process Q after inserting events is the execution of Q without events from the perspective of the attacker. All events must be declared (in the list of declarations in the input file) in the form `event e(t1,...,tn).` where t1,...,tn are the types of the event arguments. Relationships between events may now be specified as correspondence assertions.

#### Correspondence

The syntax to query a basic correspondence assertion is:

```proverif
query x1 :t1,...,xn : tn; event(e(M1,...,Mj)) ==> event(e′(N1,...,Nk)).
```

where M1,...,Mj,N1,...,Nk are terms built by the application of constructors to the variables x1,...,xn of types t1,...,tn and e, e′ are declared as events. The query is satisfied if, for each occurrence of the event e(M1,...,Mj), there is a previous execution of e′(N1,...,Nk). Moreover, the parameterization of the events must satisfy any relationships defined by M1,...,Mj,N1,...,Nk; that is, the variables x1,...,xn have the same value in M1,...,Mj and in N1,...,Nk.

In such a query, the variables that occur before the arrow ==> (that is, in M1,...,Mj) are universally quantified, while the variables that occur after the arrow ==> (in N1,...,Nk) but not before are existentially quantified. For instance,

```proverif
query x:t1, y:t2, z:t3; event(e(x,y)) ==> event(e′(y,z)).
```

means that, for all x,y, for each occurrence of e(x,y), there is a previous occurrence of e′(y,z) for some z.

#### Injective correspondence

The definition of correspondence we have just discussed is insufficient to capture authentication in cases where a one-to-one relationship between the number of protocol runs performed by each participant is desired. Consider, for example, a financial transaction in which the server requests payment from the client; the server should complete the transaction only once for each transaction started by the client. (If this were not the case, the client could be charged for several transactions, even if the client only started one.) The situation is similar for access control and other scenarios. Injective correspondence assertions capture the one-to-one relationship and are denoted:

```proverif
query x1 :t1,...,xn : tn; inj−event(e(M1,...,Mj)) ==> inj−event(e′(N1,...,Nk)).
```

Informally, this correspondence asserts that, for each occurrence of the event e(M1,...,Mj), there is a distinct earlier occurrence of the event e′(N1,...,Nk). It follows immediately that the number of occurrences of e′(N1,...,Nk) is greater than, or equal to, the number of occurrences of e(M1,...,Mj). Note that using inj−event or event before the arrow ==> does not change the meaning of the query. It is only important after the arrow.

### 3.2.3 Example: Secrecy and authentication in the handshake protocol

Authentication can be captured using correspondence assertions (additional applications of correspondence assertions were discussed in §1.1). Recall that in addition to the secrecy property mentioned for the handshake protocol in Figure 3.1, there were also authentication properties. The protocol is intended to ensure that, if client A thinks she executes the protocol with server B, then she really does so, and vice versa. When we say 'she thinks' that she executes it with B, we mean that the data she receives indicates that fact. Accordingly, we declare the events:

- `event acceptsClient(key)`, which is used by the client to record the belief that she has accepted to run the protocol with the server B and the supplied symmetric key.
- `event acceptsServer(key,pkey)`, which is used to record the fact that the server considers he has accepted to run the protocol with a client, with the proposed key supplied as the first argument and the client's public key as the second.
- `event termClient(key,pkey)`, which means the client believes she has terminated a protocol run using the symmetric key supplied as the first argument and the client's public key as the second.
- `event termServer(key)`, which denotes the server's belief that he has terminated a protocol run with the client A with the symmetric key supplied as the first argument.

Recall that the client is only willing to share her secret with the server B; it follows that, if she completes the protocol, then she believes she has done so with B and hence authentication of B to A should hold. In contrast, server B is willing to run the protocol with any client (that is, he is willing to learn secrets from many clients), and hence at the end of the protocol he only expects authentication of A to B to hold, if he believes A was indeed his interlocutor (so termServer(x) is executed only when pkX = pkA).

We can now formalize the two authentication properties (given in Figure 3.1) for the handshake protocol. They are, respectively:

```proverif
query x:key,y:spkey;event(termClient(x,y))==>event(acceptsServer(x,y)).
query x:key;inj−event(termServer(x))==>inj−event(acceptsClient(x)).
```

The subtle difference between the two correspondence assertions is due to the differing authentication properties expected by participants A and B. The first correspondence is not injective because the protocol does not allow the client to learn whether the messages she received are fresh: the message from the server to the client may be replayed, leading to several client sessions for a single server session. The revised ProVerif encoding with annotations and correspondence assertions is presented below and in the file docs/ex handshake annotated.pv (cryptographic declarations have been omitted for brevity):

```proverif
1  free c:channel.
2
3  free s: bitstring [private].
4  query attacker(s).
5
6  event acceptsClient(key).
7  event acceptsServer(key,pkey).
8  event termClient(key,pkey).
9  event termServer(key).
10
11 query x:key,y:pkey; event(termClient(x,y))==>event(acceptsServer(x,y)).
12 query x:key; inj−event(termServer(x))==>inj−event(acceptsClient(x)).
13
14 let clientA(pkA:pkey, skA:skey, pkB:spkey) =
15    out(c,pkA);
16    in(c,x: bitstring);
17    let y = adec(x,skA) in
18    let (=pkB,k:key) = checksign(y,pkB) in
19   event acceptsClient(k);
20   out(c,senc(s,k));
21   event termClient(k,pkA).
22
23 let serverB(pkB:spkey, skB:sskey, pkA:pkey) =
24    in(c,pkX:pkey);
25    new k:key;
26    event acceptsServer(k,pkX);
27    out(c,aenc(sign((pkB,k),skB),pkX));
28    in(c,x: bitstring);
29    let z = sdec(x,k) in
30    if pkX = pkA then event termServer(k).
31
32 process
33    new skA:skey;
34    new skB:sskey;
35    let pkA = pk(skA) in out(c,pkA);
36    let pkB = spk(skB) in out(c,pkB);
37    ( (!clientA(pkA,skA,pkB)) | (!serverB(pkB,skB,pkA)) )
```

**Figure 3.4 — Messages and events for authentication.**

```
                            Client                                    Server
                                            message n−1                event acceptsServer
          event termClient
       event acceptsClient                   message n                  event termServer
```

There is generally some flexibility in the placement of events in a process, but not all choices are correct. For example, in order to prove authentication in our handshake protocol, we consider the property

```proverif
query x:key; inj−event(termServer(x))==>inj−event(acceptsClient(x)).
```

and the event termServer is placed when the server terminates (typically at the end of the protocol), while acceptsClient is placed when the client accepts (typically before the client sends its last message). Therefore, when the last message, message n, is from the client to the server, the placement of events follows Figure 3.4: the last message sent by the client is message n, so acceptsClient is placed before the client sends message n, and termServer is placed after the server receives message n. The last message sent by the server is message n−1, so acceptsServer is placed before the server sends message n−1, and termClient is placed after the client receives message n − 1 (any position after that reception is fine). More generally, the event that occurs before the arrow ==> can be placed at the end of the protocol, but the event that occurs after the arrow ==> must be followed by at least one message output. Otherwise, the whole protocol can be executed without executing the latter event, so the correspondence certainly does not hold.

One can also note that moving an event that occurs before the arrow ==> towards the beginning of the protocol strengthens the correspondence property, and moving an event that occurs after the arrow ==> towards the end of the protocol also strengthens the correspondence property. Adding arguments to the events strengthens the correspondence property as well.

## 3.3 Understanding ProVerif output

The output produced by ProVerif is rather verbose and can be overwhelming for new users. In essence the output is in the following format:

```
[ Equations ]
Process:
 [ Process ]
−− Query [Query]
Completing ...
Starting query [Query]
goal [un] reachable : [Goal]
Abbreviations:
 . . .
[ Attack derivation ]
A more detailed output of the traces is available with
  set traceDisplay = long.
[ Attack trace ]
RESULT [Query] [ result ].
−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−
Verification summary:
[ Summary of verification results ]
−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−−
```

where [Equations] summarizes the internal representation of the equations given in the input file (if any) and [Process] presents the input process with all macros expanded and distinct identifiers assigned to unique names/variables; in addition, parts of the process are annotated with identifiers {n} where n ∈ N∗. (New users may like to refer to this interpreted process to ensure they have defined the scope of variables in the correct manner and to ensure they haven't inadvertently bound processes inside if-then-else/let-in-else statements.) ProVerif then begins to evaluate the [Query] provided by the user. Internally, ProVerif attempts to prove that a state in which a property is violated is unreachable; it follows that ProVerif shows the (un)reachability of some [Goal]. If a property is violated then ProVerif attempts to reconstruct an [Attack derivation] in English and an [Attack trace] in the applied pi calculus. ProVerif then reports whether the query was satisfied. Finally, ProVerif displays a summary of the verification results of all the queries in the file. For convenience, Linux and cygwin users may make use of the following command:

```
./proverif ⟨filename⟩.pv | grep "RES"
```

which reduces the output to the results of the queries.

### 3.3.1 Results

In order to understand the results correctly, it is important to understand the difference between the attack derivation and the attack trace. The attack derivation is an explanation of the actions that the attacker has to make in order to break the security property, in the internal representation of ProVerif. Because this internal representation uses abstractions, the derivation is not always executable in reality; for instance, it may require the repetition of certain actions that can in fact never be repeated, for instance because they are not under a replication. In contrast, the attack trace refers to the semantics of the applied pi calculus, and always corresponds to an executable trace of the considered process.

ProVerif can display three kinds of results:

- **RESULT [Query] is true:** The query is proved, there is no attack. In this case, ProVerif displays no attack derivation and no attack trace.
- **RESULT [Query] is false:** The query is false, ProVerif has discovered an attack against the desired security property. The attack trace is displayed just before the result (and an attack derivation is also displayed, but you should focus on the attack trace since it represents the real attack).
- **RESULT [Query] cannot be proved:** This is a "don't know" answer. ProVerif could not prove that the query is true and also could not find an attack that proves that the query is false. Since the problem of verifying protocols for an unbounded number of sessions is undecidable, this situation is unavoidable. Still, ProVerif gives some additional information that can be useful in order to determine whether the query is true. In particular, ProVerif displays an attack derivation. By manually inspecting the derivation, it is sometimes possible to reconstruct an attack. For observational equivalence properties, it may also display an attack trace, even if this trace does not prove that the observational equivalence does not hold. We will come back to this point when we deal with observational equivalence, in Section 4.3.2. Sources of incompleteness, which explain why ProVerif sometimes fails to prove properties that hold, will be discussed in Section 6.7.5.

#### Interpreting results

Understanding the internal manner in which ProVerif operates is useful to interpret the results output. Recall that ProVerif attempts to prove that a state in which a property is violated is unreachable. It follows that when ProVerif is supplied with query `attacker(M).`, that internally ProVerif attempts to show `not attacker(M)` and hence `RESULT not attacker(M) is true.` means that the secrecy of M is preserved by the protocol.

#### Error and warning messages

In case of a syntax error, ProVerif indicates the character position of the error (line and column numbers). Please use your text editor to find the position of the error. (The error messages can be interpreted by emacs.) In addition, ProVerif may provide various warning messages. The earlier grep command can be modified into `./proverif ⟨filename⟩.pv | egrep "RES|Err|War"` for more manageable output with notification of error/warnings, although a more complex command is required to read any associated messages. In this case, the command `./proverif ⟨filename⟩.pv | less` can be useful.

### 3.3.2 Example: ProVerif output for the handshake protocol

Executing the handshake protocol with `./proverif docs/ex handshake annotated.pv | grep "RES"` produces the following output:

```
RESULT not attacker(s []) is false .
RESULT event(termClient(x 2 ,y 1)) ==> event(acceptsServer(x 2 ,y 1)) is false .
RESULT inj−event(termServer(x 2)) ==> inj−event(acceptsClient(x 2)) is true.
```

which informs us that authentication of A to B holds, but authentication of B to A and secrecy of s do not hold.

#### Analyzing attack traces

By inspecting the output more closely, we can reconstruct the attack. For example, let us consider the query query attacker(s) which produces the following:

```
1  Process 0 (that is , the initial process):
2  {1}new skA: skey;
3  {2}new skB: sskey;
4  {3}let pkA: pkey = pk(skA) in
5  {4}out(c, pkA);
6  {5}let pkB: spkey = spk(skB) in
7  {6}out(c, pkB);
8  (
9       {7}!
10      {8}out(c, pkA);
11      {9}in(c, x: bitstring );
12      {10}let y: bitstring = adec(x,skA) in
13      {11}let (=pkB,k: key) = checksign(y,pkB) in
14      {12}event acceptsClient(k);
15      {13}out(c, senc(s ,k));
16      {14}event termClient(k,pkA)
17  )  | (
18      {15}!
19      {16}in(c, pkX: pkey);
20      {17}new k 1: key;
21      {18}event acceptsServer(k 1 ,pkX);
22      {19}out(c, aenc(sign((pkB,k 1),skB),pkX));
23      {20}in(c, x 1: bitstring );
24      {21}let z: bitstring = sdec(x 1 ,k 1) in
25      {22}if (pkX = pkA) then
26      {23}event termServer(k 1)
27  )
28
29 −− Query not attacker(s []) in process 0.
30  Completing ...
31  Starting query not attacker(s [])
32  goal reachable: attacker(s [])
33
34  Derivation:
35  Abbreviations:
36  k 2 = k 1[pkX = pk(sk) ,!1 = @sid]
37
38  1. The attacker has some term sk.
39  attacker(sk).
40
41  2. By 1, the attacker may know sk.
42  Using the function pk the attacker may obtain pk(sk).
43  attacker(pk(sk)).
44
45  3. The message pk(sk) that the attacker may have by 2 may be received at
46  input {16}.
47  So the message aenc(sign((spk(skB[]) , k 2),skB[]) ,pk(sk)) may be sent to the
48  attacker at output {19}.
49  attacker(aenc(sign((spk(skB[]) , k 2),skB[]) ,pk(sk ))).
50
51  4. By 3, the attacker may know aenc(sign((spk(skB[]) , k 2),skB[]) ,pk(sk)).
52  By 1, the attacker may know sk.
53    Using the function adec the attacker may obtain sign((spk(skB[]) , k 2),skB[]).
54    attacker(sign((spk(skB[]) , k 2),skB[])).
55
56    5. By 4, the attacker may know sign((spk(skB[]) , k 2),skB[]).
57    Using the function getmess the attacker may obtain (spk(skB[]) , k 2).
58    attacker((spk(skB[]) , k 2 )).
59
60    6. By 5, the attacker may know (spk(skB[]) , k 2).
61    Using the function 2−proj−2−tuple the attacker may obtain k 2.
62    attacker(k 2).
63
64    7. The message pk(skA[]) may be sent to the attacker at output {4}.
65    attacker(pk(skA[])).
66
67    8. By 4, the attacker may know sign((spk(skB[]) , k 2),skB[]).
68  By 7, the attacker may know pk(skA[]).
69    Using the function aenc the attacker may obtain
70    aenc(sign((spk(skB[]) , k 2),skB[]) ,pk(skA[])).
71    attacker(aenc(sign((spk(skB[]) , k 2),skB[]) ,pk(skA[]))).
72
73    9. The message aenc(sign((spk(skB[]) , k 2),skB[]) ,pk(skA[])) that the attacker
74  may have by 8 may be received at input {9}.
75    So the message senc(s[] , k 2) may be sent to the attacker at output {13}.
76    attacker(senc(s [] , k 2 )).
77
78    10. By 9, the attacker may know senc(s[] , k 2).
79  By 6, the attacker may know k 2.
80    Using the function sdec the attacker may obtain s [].
81    attacker(s []).
82
83    11. By 10, attacker(s []).
84    The goal is reached , represented in the following fact :
85    attacker(s []).
86
87
88  A more detailed output of the traces is available with
89       set traceDisplay = long.
90
91  new skA: skey creating skA 1 at {1}
92
93  new skB: sskey creating skB 1 at {2}
94
95    out(c, ˜M) with ˜M = pk(skA 1) at {4}
96
97    out(c, ˜M 1) with ˜M 1 = spk(skB 1) at {6}
98
99    out(c, ˜M 2) with ˜M 2 = pk(skA 1) at {8} in copy a
100
101    in(c, pk(a 1)) at {16} in copy a 2
102
103  new k 1: key creating k 2 at {17} in copy a 2
104
105    event acceptsServer(k 2 ,pk(a 1)) at {18} in copy a 2
106
107  out(c, ˜M 3) with ˜M 3 = aenc(sign((spk(skB 1),k 2),skB 1),pk(a 1)) at {19}
108  in copy a 2
109
110  in(c, aenc(adec(˜M 3,a 1),˜M)) with aenc(adec(˜M 3,a 1),˜M) =
111  aenc(sign((spk(skB 1),k 2),skB 1),pk(skA 1)) at {9} in copy a
112
113  event acceptsClient(k 2) at {12} in copy a
114
115  out(c, ˜M 4) with ˜M 4 = senc(s ,k 2) at {13} in copy a
116
117  event termClient(k 2 ,pk(skA 1)) at {14} in copy a
118
119  The attacker has the message
120  sdec(˜M 4,2−proj−2−tuple(getmess(adec(˜M 3,a 1)))) = s.
121  A trace has been found.
122  RESULT not attacker(s []) is false .
```

ProVerif first outputs its internal representation of the process under consideration. Then, it handles each query in turn. The output regarding the query query attacker(s) can be split into three main parts:

- From "Abbreviations" to "A more detailed...", a description of the derivation that leads to the fact attacker(s).
- After "A more detailed..." until "A trace has been found", a description of the corresponding attack trace.
- Finally, the "RESULT" line concludes: the property is false, there is an attack in which the attacker gets s.

Let us first explain the derivation. It starts with a list of abbreviations: these abbreviations give names to some subterms, in order to display them more briefly; such abbreviations are used for the internal representation of names (keys, nonces, ...), which can sometimes be large terms that represent simple atomic data. Next, the description of the derivation itself starts. It is a numbered list of steps, here from 1 to 10. Each step corresponds to one action of the process or of the attacker. After an English description of the step, ProVerif displays the fact that is derived thanks to this step, here attacker(M) for some term M, meaning that the attacker has M.

- In step 1, the attacker chooses any value sk in its knowledge (which it is going to use as its secret key).
- In step 2, the attacker uses the knowledge of sk obtained at step 1 ("By 1") to compute the corresponding public key pk(sk) using function pk.
- Step 3 is a step of the process. Input {16} (the numbers between braces refer to program points also written between braces in the description of the process, so input {16} is the input of Line 19) receives the message pk(sk) from the attacker, and output {19} (the one at Line 22) replies with aenc(sign((spk(skB[]),k 2),skB[]),pk(sk)). Note that k 2 is an abbreviation for k 2 = k 1[pkX = pk(sk),!1 = @sid], as listed at the beginning of the derivation. It designates the key k 2 generated by the new at Line 20, in session @sid (the number of the copy generated by the replication at Line 18, designated by !1, that is, the first replication), when the key pkX received by the input at Line 19 is pk(sk). ProVerif displays skB[] instead of skB when skB is a name without argument (that is, a free name or a name chosen under no replication and no input). In other words, the attacker starts a session of the server B with its own public key and gets the corresponding message aenc(sign((spk(skB[]),k 2),skB[]),pk(sk)).
- Steps 4 to 6 are again applications of functions by the attacker to perform its internal computations: the attacker decrypts the message aenc(sign((spk(skB[]),k 2),skB[]),pk(sk)) received at step 3 and gets the signed message, so it obtains sign((spk(skB[]),k 2),skB[]) (step 4) and k 2 (step 6).
- Step 7 uses a step of the process: by the output {4} (the one at Line 5), the attacker gets pk(skA[]).
- At step 8, the attacker reencrypts sign((spk(skB[]),k 2),skB[]) with pk(skA[]).
- Step 9 is again a step of the process: the attacker sends aenc(sign((spk(skB[]),k 2),skB[]),pk(skA[])) (obtained at step 8) to input {9} (at Line 11) and gets the reply senc(s [], k 2). In other words, the attacker has obtained a correct message 2 for a session between A and B. It sends this message to A who replies with senc(s [], k 2) as if it was running a session with B.
- In step 10, the attacker decrypts senc(s [], k 2) since it has k 2 (by step 6), so it obtains s[].
- Finally, step 11 indicates that the query goal has been reached, that is, attacker(s[]).

As one can notice, this derivation corresponds exactly to the attack against the protocol outlined in Figure 3.1. The display of the derivation can be tuned by some settings: set abbreviateDerivation = false prevents the use of abbreviations for names and set explainDerivation = false switches to a display of the derivation by explicit references to the Horn clauses used internally by ProVerif instead of relating the derivation to the process. (See also Section 6.6.2 for details on these settings.)

Next, ProVerif reconstructs a trace in the semantics of the pi calculus, corresponding to this derivation. This trace is presented as a sequence of inputs and outputs on public channels and of events. The internal reductions of the process are not displayed for brevity. (As mentioned in the output, it is possible to obtain a more detailed display with the state of the process and the knowledge of the attacker at each step by adding set traceDisplay = long. in your input file.) Each input, output, or event is followed by its location in the process "at {n}", which refers to the program point between braces in the process displayed at the beginning. When the process is under replication, several copies of the process may be generated. Each of these copies is named (by a name like "a n"), and ProVerif indicates in which copy of the process the input, output, or event is executed. The name itself is unimportant, just the fact that the copy is the same or different is important: the presence of different names of copies for the same replication shows that several sessions are used. Let us explain the trace in the case of the handshake protocol:

- The first two new correspond to the creation of secret keys.
- The first two outputs correspond to the outputs of public keys, at outputs {4} (Line 5) and {6} (Line 7). The attacker stores these public keys in fresh variables ˜M and ˜M 1 respectively, so that it can reuse them later.
- The third output is the output of pkA at output {8} (Line 10), in a session of the client A named a.
- The next 4 steps correspond to a session of the server B (copy a 2) with the attacker: the attacker sends its public key pk(a 1) at the input {16} (Line 19). A fresh shared key k 2 is then created. The event acceptsServer is executed (Line 21), and the message aenc(sign((spk(skB 1), k 2), skB 1), pk(a 1)) is sent at output {19} (Line 22) and stored in variable ˜M 3, a fresh variable that can be used later by the attacker. These steps correspond to step 3 of the derivation above.
- The last 4 steps correspond to the end of the execution of the session a of the client A. The attacker computes aenc(adec(˜M 3,a 1),˜M)) and obtains the message aenc(sign((spk(skB 1),k 2),skB 1),pk(skA 1)), which it sends to the input {9} (Line 11). The event acceptsClient is executed (Line 14), the message senc(s,k 2) is sent at output {13} (Line 15) and stored in variable ˜M 4 and finally the event termClient is executed (Line 16). These steps correspond to step 9 of the derivation above.
- Finally, the attacker obtains s[] by computing sdec(˜M 4, 2−proj−2−tuple(getmess(adec(˜M 3, a 1)))).

This trace shows that there is an attack against the secrecy of s, it corresponds to the attack against the protocol outlined in Figure 3.1.

Another way to represent an attack found by ProVerif is by a graph. For instance, the attack explained previously is shown in Figure 3.5. To obtain such a graph, use the command-line option -graph or -html described in Section 6.6.1.

**Figure 3.5 — Handshake protocol attack trace.**

The detailed version is built when set traceDisplay = long. has been added to the input .pv file. The graph starts always with two processes: the honest one, and the attacker. The progress of the attack is represented vertically. Parallel processes are represented by several columns. Replications of processes are denoted by nodes labeled by !, with a column for each created process. Processes fork when a parallel composition is reduced. The termination of a process is represented by a point. An output on a public channel is represented by a horizontal arrow from the process that makes the output to the attacker. The edge is labeled with an equality X = M where M is the sent message and X is a fresh variable (or tuple of variables) in which the adversary stores it. An input on a public channel is represented by an arrow from the attacker to the receiving process, labeled with an equality R = M, where R is the computation performed by the attacker to obtain the sent message M. The message M is omitted when it is exactly equal to R, for instance when R is a constant. A communication made on a private channel is represented by an arrow from the process that outputs the message to the process that receives it; this arrow is labeled with the message. Creation of nonces and other steps are represented in boxes. Information about the attack is written in red; the displayed information depends on the security property that is broken by the attack. The text "a trace has been found" is written at the top of the figure, possibly with assumptions necessary for the attack. When labels are too long to fit on arrows, a table of abbreviations appears at the top right of the figure.

Let us take a closer look at Figure 3.5. First, two new secret keys are created by the honest process. Then the corresponding public keys are sent on a public channel; the attacker receives them and stores them in ˜M and ˜M 1. Next, a parallel reduction is made. We obtain two processes which replicate themselves once each. The first process (clientA) sends its public key on a public channel, and the attacker receives it. Then the attacker sends the message pk(a 1), containing its own public key, to the second process serverB. This process then creates a new shared key k 2 and executes the event acceptsServer(k 2,pk(a 1)). It sends the message aenc(sign((spk(skB 1), k 2), skB 1), pk(a 1)) on a public channel; the attacker receives it and stores it in ˜M 3. The attacker computes aenc(adec(˜M 3,a 1),˜M)), that is, it decrypts and reencrypts the message, thus obtaining aenc(sign((spk(skB 1),k 2),skB 1),pk(skA 1)). It sends that message to clientA. The process clientA executes the event acceptsClients(k 2) and sends the message senc(s,k 2). The attacker receives it and stores it in ˜M 4. Finally, the attacker computes sdec(˜M 4,2−proj−2−tuple(getmess(adec(˜M 3,a 1)))), and obtains the secret s. This point is mentioned in the red box at the bottom right of the page. The process clientA executes the last event termClient, and terminates. This is the end of the attack. The line numbers of each step appear in green in boxes. The keywords are written in blue, while the names of processes are written in green.

For completeness, we present the complete formalization of the rectified protocol, which ProVerif can successfully verify, below and in the file docs/ex handshake annotated fixed.pv.

```proverif
1   (* Symmetric key encryption *)
2
3   type key.
4   fun senc(bitstring, key): bitstring.
5   reduc forall m: bitstring, k: key; sdec(senc(m,k),k) = m.
6
7
8   (* Asymmetric key encryption *)
9
10  type skey.
11  type pkey.
12
13  fun pk(skey): pkey.
14  fun aenc(bitstring, pkey): bitstring.
15
16  reduc forall m: bitstring, sk: skey; adec(aenc(m,pk(sk)), sk) = m.
17
18
19  (* Digital signatures *)
20
21  type sskey.
22  type spkey.
23
24  fun spk(sskey): spkey.
25  fun sign(bitstring, sskey): bitstring.
26
27  reduc forall m: bitstring, ssk: sskey; getmess(sign(m,ssk)) = m.
28  reduc forall m: bitstring, ssk: sskey; checksign(sign(m,ssk),spk(ssk)) = m.
29
30
31  free c:channel.
32
33  free s: bitstring [private].
34  query attacker(s).
35
36  event acceptsClient(key).
37  event acceptsServer(key,pkey).
38  event termClient(key,pkey).
39  event termServer(key).
40
41  query x:key,y:pkey; event(termClient(x,y))==>event(acceptsServer(x,y)).
42  query x:key; inj−event(termServer(x))==>inj−event(acceptsClient(x)).
43
44   let clientA(pkA:pkey, skA:skey, pkB:spkey) =
45       out(c,pkA);
46       in(c,x: bitstring);
47       let y = adec(x,skA) in
48       let (=pkA,=pkB,k:key) = checksign(y,pkB) in
49       event acceptsClient(k);
50       out(c,senc(s,k));
51       event termClient(k,pkA).
52
53   let serverB(pkB:spkey, skB:sskey, pkA:pkey) =
54       in(c,pkX:pkey);
55       new k:key;
56       event acceptsServer(k,pkX);
57       out(c,aenc(sign((pkX,pkB,k),skB),pkX));
58       in(c,x: bitstring);
59       let z = sdec(x,k) in
60       if pkX = pkA then event termServer(k).
61
62  process
63      new skA:skey;
64      new skB:sskey;
65       let pkA = pk(skA) in out(c,pkA);
66       let pkB = spk(skB) in out(c,pkB);
67       ( (!clientA(pkA,skA,pkB)) | (!serverB(pkB,skB,pkA)) )
```

## 3.4 Interactive mode

As indicated in Section 1.4, ProVerif comes with a program proverif interact which allows to simulate the execution of a process run. There are two ways to launch this program. By typing the name of the program. It then opens a file chooser dialog allowing to choose a .pv or .pcv file containing the description of the protocol. (.pcv files are for CryptoVerif compatibility, see Section 6.8. To choose a .pcv file, you first need to change the filter at the bottom right of the file chooser dialog.) The other way is by typing the name of the program, followed by the path of the .pv or .pcv file. In this case, the simulator starts directly. When the input file is correctly loaded, a window appears, as in Figure 3.6, where the loaded file is the model of the handshake protocol, available in docs/ex handshake.pv.

**Figure 3.6 — Handshake protocol — Initial simulator window.**

### 3.4.1 Interface description

The simulator is made of a main window which allows to make reduction steps on running processes. This window contains several columns representing the current state of the run. The first column, titled "Public", contains all public elements of the current state. For example, after loading the file containing the handshake protocol, the channel c appears in the public column as expected, since c is declared public in the input file (see Figure 3.6). The last columns show processes that are currently running in parallel. To make a reduction step on a specific process, you can click on the head of the column representing the process to reduce. To allow the attacker to create a nonce, there is a button "New nonce", or an option in the "Reduction" menu, or a keyboard shortcut Ctrl+C. If the types are not ignored (by including set ignoreTypes = false in your input file, see Section 6.6.2), a dialog box opens and asks the type of the nonce. When a nonce is created, it is added to the public elements of the current state. To go one step backward, there is a button "Backward", or an option in the "Reduction" menu, or a keyboard shortcut Ctrl+B. The button "Forward", the option "Forward" of the "Reduction" menu, or the keyboard shortcut Ctrl+F allow the user to re-execute a step that has been undone by the "Backward" button. The button "Add a term to public" is explained in Section 3.4.5. The interface also allows to display a drawing of the current trace in a new window by clicking on "Display trace" in the "Show" menu, or by hitting Ctrl+D. Each time a new reduction step is made, the drawing is refreshed. The trace can be saved by selecting "Save File" in the "Save" menu, or hitting Ctrl+S. One of these formats: .png, .pdf, .jpg or .eps, must be used to save the file, and the name of the file with its extension must be given. Note that a more detailed version of the trace is available if set traceDisplay = long. has been added to the input file. The main window and the menu also contains two other options: "Next auto-step" and "All auto-steps". We explain this functionality in the next section.

### 3.4.2 Manual and auto-reduction

There are two kinds of processes. The ones on which the first reduction can be done without the intervention of the user (called auto-reducible processes), and the ones that require the intervention of the user (called manually-reducible processes).

- The processes 0, P | Q, new n : t; P, let x = M in P else Q, if M then P else Q, and event e(M1,...,Mn); P are all auto-reducible.
- The process !P is manually reducible.
- The process out(M,N); P is auto-reducible if the channel M is public, or the evaluation of the message N or of the channel M fails. Otherwise, it is a manually-reducible process.
- The process in(M,x : T); P is auto-reducible if the evaluation of the channel M fails. Otherwise, it is a manually-reducible process.

When auto-reducible processes are running and you press the button "All auto-steps" (or if you select this option on the menu), it reduces all auto-reducible processes that are running. When you press the button "Next auto-step", it makes one step of reduction on the first auto-reducible process. Manually-reducible processes can be reduced only by clicking on the head of their column.

### 3.4.3 Execution of 0, P | Q, !P, new, let, if, and event

The reduction of 0 just removes the process. The reduction of P | Q separates the process P | Q into two processes P and Q (a column is added to the main window). The reduction of !P adds a copy of P in a new column at the left of !P. The reduction of new n : t;P creates a fresh nonce local to the process P. The reduction of let x = M in P else Q evaluates M. If this evaluation succeeds, then the process becomes P with the result of M substituted for x. Otherwise, the process becomes Q. The reduction of if M then P else Q evaluates M. If M evaluates to true, then the process becomes P. If the evaluation of M succeeds and M evaluates to a value other than true, then the process becomes Q. If the evaluation of M fails, then the process is removed. The reduction of event e(M1,...,Mn); P evaluates M1,...,Mn. If these evaluations succeed, the process becomes P. Otherwise, the process is removed. The user can display a column titled "Events", showing the list of executed events by selecting the item "Show/hide events" in the "Show" menu or using the keyboard shortcut Ctrl+E.

### 3.4.4 Execution of inputs and outputs

There are several possible kinds of inputs and outputs, depending on whether the process is auto-reducible or not, and on whether the channel is public or not. Let us first consider the case of out(M,N); P.

- If the process is auto-reducible because the evaluation of the channel M or of the message N fails, then the process is removed.
- If the evaluations of the message N and the channel M succeed and the channel M is public, then the output is made as explained in Section 3.1.4. The message is added to the public elements of the current state. It is displayed as follows ˜M i = N, where ˜M i is a new binder: this binder can then be used to designate the term N in the computations that the adversary makes in the rest of the execution. Such computations are called recipes. They are terms built from the binders ˜M i, the nonces created by the adversary, the names that are initially public, and application of public functions to recipes. In the general case, the public elements of the current state are represented in the form binder = recipe = message, where the recipe is the computation that the adversary makes to obtain the corresponding message, and the binder can be used to designate that message in future recipes. To lighten the display, the binder is omitted when it is equal to the recipe, and the recipe is omitted when it is equal to the message itself.
- If the evaluations of the message N and the channel M succeed but the channel M is not known to be public (this case is displayed "Output (private)" in the head of the column), then there are two possibilities.
  - Prove that the channel is in fact public, and make a public communication. To do so, a recipe using public elements of the current state must be given. If this recipe is evaluated as equal to the channel, a public output on this channel is made.
  - Make a private communication on this channel between two processes. If this choice has been made, the list of all the input processes on the same channel appears in the main window. The user chooses the process that will receive the output message. If there is no such process, the reduction is not possible and an error message appears.

Let us now consider the case of in(M,x : T); P.

- If the evaluation of the channel M fails, then the process is removed.
- If the evaluation of the channel M succeeds and the channel is public, then a pop-up window opens, and the user gives the message to send on the channel. The message is given in the form of a recipe, which can contain recipes of public elements of the current state, and applications of public functions. In case the recipe is wrongly typed, if types are ignored (the default), then a warning message box appears, allowing the user to choose to continue or go back. If types are not ignored (the input file contains set ignoreTypes = false), an error message box appears, and a new message must be given.
- If the evaluation of the channel M succeeds and the channel is not known to be public (this case is displayed "Input (private)" in the head of the column), then the program works similarly to the case of a private output. There are again two possibilities: prove that the channel is public by giving a recipe and make an input from the adversary, or choose an output process to make a private communication between these processes as explained above.

In addition to the public functions explicitly defined in the input file, recipes can also contain projection functions. The syntax for projections associated to tuples differs depending on whether types are ignored or not. If types are ignored (the default), then the i-th projection of a tuple of arity m is written i−proj−m−tuple. Otherwise, when the input file contains set ignoreTypes = false, i−proj−<type1>−...−<typem>−tuple is the i-th projection of a tuple of arity m, when <typen> is the type of the n-th argument of the tuple. For instance, 2−proj−channel−bitstring−tuple is the second projection of a pair with arguments of type channel and bitstring, so 2−proj−channel−bitstring−tuple((c, m)) = m, where c is a channel and m is a bitstring. The i-th projection of a previously defined data constructor f (see Section 4.1.2) is written i−proj−f.

### 3.4.5 Button "Add a term to public"

Please recall that the elements in public are of the form binder = recipe = message (see Section 3.4.4 for more information on public elements). Clicking the button "Add a term to public" allows the user to add a public term to the current state computed by attacker. The user gives the recipe that the attacker uses to compute this term. It is then evaluated. If the evaluation fails, an error message appears. If the evaluation succeeds, an entry ˜M i = recipe = t is added to the column "Public", where t is the result of the evaluation of the recipe and ˜M i is a fresh binder associated to it. ˜M i can then be used in future recipes in order to represent the term t.

### 3.4.6 Execution of insert and get

You can ignore this section if you do not use tables, defined in Section 4.1.5. The constructs insert and get respectively insert an element in a table and read a table.

The process insert d(M1,...,Mn); P is auto-reducible if it is the only process or if the evaluation of one of the Mi fails. To insert an element, just click on the head of the column representing the insert process to reduce. If the evaluation succeeds, the element is inserted and appears in the column "Tables". Otherwise, the process is removed. The user can display a column titled "Tables", containing all elements of tables obtained by insert steps, by selecting the item "Show/hide tables" in the "Show" menu or using the keyboard shortcut Ctrl+T.

The process get d(T1,...,Tn) suchthat M in P else Q is never auto-reducible. To get an element from a table, click on the head of the column to reduce. Three cases are possible, depending on the set of terms in the table d that match the patterns T1,...Tn and satisfy the condition M. First, if there is no such term, then the else branch of the get is executed. Second, if there is only one such term, then this term is selected, and the in branch is executed with the variables of T1,...Tn instantiated to match this term, as explained in Section 4.1.5. Or third, if there are several such terms, then a window showing all the possible terms is opened. To make the reduction, double-click on the chosen term.

### 3.4.7 Handshake run in interactive mode

Let us see how to execute a trace similar to the one represented in Figure 3.5 starting from Figure 3.6.

- First, a click on the "All auto-steps" button will lead to the situation represented in Figure 3.7: the honest process first creates two secret keys, then output a first public key after a let, and then a second one after another let on channel c. The attacker stores these public keys in fresh variables ˜M 2 and ˜M 3. A parallel reduction is then made after that.

**Figure 3.7 — Handshake protocol — Simulator window 1.**

- The first process ClientA can now be replicated, by clicking "Replication" at the top of its column. Three processes are obtained. The first process can make an output by clicking on "Next auto-step".
- The process ServerB is then replicated by clicking on the column representing the third process. A click on "New nonce" allows the attacker to create his secret key n, which is added to the public elements of the current state. The message pk(n) can then be input on channel c by clicking on the same column and giving pk(n) as recipe. The result is shown in Figure 3.8.

**Figure 3.8 — Handshake protocol — Simulator window 2.**

- A new click on the third process creates a fresh key k 2. Another click sends the message aenc(sign(spk(skB 2), k 2), skB 2, pk(n)), and the attacker stores this message in a fresh variable ˜M 4.
- The message aenc(adec(˜M 4, n),˜M 2) can then be input on channel c, by clicking on the first process and giving aenc(adec(˜M 4, n),˜M 2) as recipe.
- A click on the "All auto-steps" makes all possible reductions on the first process, leading to the output of the message senc(s, k 2) stored by the attacker in a variable ˜M 5. It leads to the window represented in Figure 3.9, and to a trace similar to the one represented in Figure 3.5.
- Finally, by clicking the button "Add a term to public" and giving the recipe sdec(˜M 5, 2−proj−2−tuple(getmess(adec(˜M 4,n)))), the attacker computes this recipe and obtains the secret s. The secret s is then added to the set of public terms.

**Figure 3.9 — Handshake protocol — Simulator window 3.**

### 3.4.8 Advanced features

If the process represented by the input file contains subterms of the form choice[L,R] or diff[L,R] (see Section 4.3.2), a pop-up window will ask the user to choose either the first or the second component of choice, or the biprocess (process with choice[L,R]). If the user chooses the first or second component, all instances of choice inside the process will then be replaced accordingly. Otherwise, the tool runs the processes using the semantics of biprocesses. If the input file is made to test the equivalence between two processes P1 and P2 (see Section 4.3.2), a pop-up window will ask the user to choose to emulate either P1 or P2.

The processes let ... suchthat ... (see Section 6.3) and sync (see Section 4.1.7) are not supported yet. Passive adversaries (the setting set attacker = passive., see Section 6.6.2) and key compromise (the setting set keyCompromise = approx. or set keyCompromise = strict., see Section 6.6.2) are not supported either. The simulator always simulates an active adversary without key compromise, even if different settings are present.

The command line options -lib [filename] (see Section 6.6.1), and -commandGraph (used to define the command for the creation of the graph trace from the dot file generated by the simulator) can be used.
