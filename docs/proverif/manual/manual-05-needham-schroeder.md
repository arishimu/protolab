# Chapter 5: Needham-Schroeder: Case Study

The Needham-Schroeder public key protocol [NS78] is intended to provide mutual authentication of two principals Alice A and Bob B. Although it is not stated in the original description, the protocol may also provide a secret session key shared between the participants. In addition to the two participants, we assume the existence of a trusted key server S.

The protocol proceeds as follows. Alice contacts the key server S and requests Bob's public key. The key server responds with the key pk(skB) paired with Bob's identity, signed using his private signing key for the purposes of authentication. Alice proceeds by generating a nonce Na, pairs it with her identity A, and sends the message encrypted with Bob's public key. On receipt, Bob decrypts the message to recover Na and the identity of his interlocutor A. Bob then establishes Alice's public key pk(skA) by requesting it to the key server S. Bob then generates his nonce Nb and sends the message (Na,Nb) encrypted for Alice. Finally, Alice replies with the message aenc(Nb, pk(skB)). The rationale behind the protocol is that, since only Bob can recover Na, only he can send message 6; and hence authentication of Bob should hold. Similarly, only Alice should be able to recover Nb; and hence authentication of Alice is expected on receipt of message 7. Moreover, it follows that Alice and Bob have established the shared secrets Na and Nb which can subsequently be used as session keys. The protocol can be summarized by the following narration:

```
(1)  A → S : (A,B)
(2)  S → A : sign((B, pk(skB)), skS)
(3)  A → B : aenc((Na, A), pk(skB))
(4)  B → S : (B,A)
(5)  S → B : sign((A, pk(skA)), skS)
(6)  B → A : aenc((Na, Nb), pk(skA))
(7)  A → B : aenc(Nb, pk(skB))
```

Informally, the protocol is expected to satisfy the following properties:

1. Authentication of A to B: if B reaches the end of the protocol and he believes he has done so with A, then A has engaged in a session with B.
2. Authentication of B to A: similarly to the above.
3. Secrecy for A: if A reaches the end of the protocol with B, then the nonces Na and Nb that A has are secret; in particular, they are suitable for use as session keys for preserving the secrecy of an arbitrary term M in the symmetric encryption senc(M,K) where K ∈ {Na,Nb}.
4. Secrecy for B: similarly.

However, nearly two decades after the protocol's inception, Gavin Lowe discovered a man-in-the-middle attack [Low96]. An attacker I engages Alice in a legitimate session of the protocol; and in parallel, the attacker is able to impersonate Alice in a session with Bob. In practice, one may like to consider the attacker to be a malicious retailer I whom Alice is willing to communicate with (presumably without the knowledge that the retailer is corrupt), and Bob is an honest institution (for example, a bank) whom Alice conducts legitimate business with. In this scenario, the honest bank B is duped by the malicious retailer I who is pretending to be Alice. The protocol narration below describes the attack (with the omission of key distribution).

```
A → I : aenc((Na,A), pk(skI))
I → B : aenc((Na,A), pk(skB))
B → A : aenc((Na,Nb), pk(skA))
A → I : aenc(Nb, pk(skI))
I → B : aenc(Nb, pk(skB))
```

Lowe fixes the protocol by the inclusion of Bob's identity in message 6; that is,

```
(6′) B → A : aenc((Na, Nb, B), pk(skA))
```

This correction allows Alice to verify whom she is running the protocol with and prevents the attack. In the remainder of this chapter, we demonstrate how the Needham-Schroeder public key protocol can be analyzed using ProVerif with various degrees of complexity.

## 5.1 Simplified Needham-Schroeder protocol

We begin our study with the investigation of a simplistic variant which allows us to concentrate on the modeling process rather than the complexities of the protocol itself. Accordingly, we consider the essence of the protocol which is specified as follows:

```
A → B : aenc((Na, pk(skA)), pk(skB))
B → A : aenc((Na, Nb), pk(skA))
A → B : aenc(Nb, pk(skB))
```

In this formalization, the role of the trusted key server is omitted and hence we assume that participants Alice and Bob are in possession of the necessary public keys prior to the execution of the protocol. In addition, Alice's identity is modeled using her public key.

### 5.1.1 Basic encoding

The declarations are standard, they specify a public channel c and constructors/destructors required to capture cryptographic primitives in the now familiar fashion:

```proverif
1  free c: channel.
2
3  (* Public key encryption *)
4  type pkey.
5  type skey.
6
7  fun pk(skey): pkey.
8  fun aenc(bitstring, pkey): bitstring.
9  reduc forall x: bitstring, y: skey; adec(aenc(x, pk(y)), y) = x.
10
11 (* Signatures *)
12 type spkey.
13 type sskey.
14
15 fun spk(sskey): spkey.
16 fun sign(bitstring, sskey): bitstring.
17 reduc forall x: bitstring, y: sskey; getmess(sign(x,y)) = x.
18 reduc forall x: bitstring, y: sskey; checksign(sign(x,y), spk(y)) = x.
19
20 (* Shared key encryption *)
21 fun senc(bitstring, bitstring): bitstring.
22 reduc forall x: bitstring, y: bitstring; sdec(senc(x,y),y) = x.
```

Process macros for A and B can now be declared and the main process can also be specified:

```proverif
let processA(pkB: pkey, skA: skey) =
    in(c, pkX: pkey);
    new Na: bitstring;
    out(c, aenc((Na, pk(skA)), pkX));
    in(c, m: bitstring);
    let (=Na, NX: bitstring) = adec(m, skA) in
    out(c, aenc(NX, pkX)).
let processB(pkA: pkey, skB: skey) =
    in(c, m: bitstring);
    let (NY: bitstring, pkY: pkey) = adec(m, skB) in
    new Nb: bitstring;
    out(c, aenc((NY, Nb), pkY));
    in(c, m3: bitstring);
    if Nb = adec(m3, skB) then 0.
process
    new skA: skey; let pkA = pk(skA) in out(c, pkA);
    new skB: skey; let pkB = pk(skB) in out(c, pkB);
    ( (!processA(pkB, skA)) | (!processB(pkA, skB)) )
```

The main process begins by constructing the private keys skA and skB for principals A and B respectively. The public parts pk(skA) and pk(skB) are then output on the public communication channel c, ensuring they are available to the attacker. (Observe that this is done using the handles pkA and pkB for convenience.) An unbounded number of instances of processA and processB are then instantiated (with the relevant parameters), representing A and B's willingness to participate in arbitrarily many sessions of the protocol.

We assume that Alice is willing to run the protocol with any other principal; the choice of her interlocutor will be made by the environment. This is captured by modeling the first input in(c, pkX: pkey) to processA as the interlocutor's public key pkX. The actual protocol then commences with Alice selecting her nonce Na, which she pairs with her identity pkA = pk(skA) and outputs the message encrypted with her interlocutor's public key pkX. Meanwhile, Bob awaits an input from his initiator; on receipt, Bob decrypts the message to recover his initiator's nonce NY and identity pkY. Bob then generates his nonce Nb and sends the message (NY,Nb) encrypted for the initiator using the key pkY. Next, if Alice believes she is talking to her interlocutor, that is, if the ciphertext she receives contains her nonce Na, then she replies with aenc(Nb, pk(skB)). (Recall that only the interlocutor who has the secret key corresponding to the public key part pkX should have been able to recover Na and hence if the ciphertext contains her nonce, then she believes authentication of her interlocutor holds.) Finally, if the ciphertext received by Bob contains his nonce Nb, then he believes that he has successfully completed the protocol with his initiator.

### 5.1.2 Security properties

Recall that the primary objective of the protocol is mutual authentication of the principals Alice and Bob. Accordingly, when A reaches the end of the protocol with the belief that she has done so with B, then B has indeed engaged in a session with A; and vice-versa for B. We declare the events:

- `event beginAparam(pkey)`, which is used by Bob to record the belief that the initiator whose public key is supplied as a parameter has commenced a run of the protocol with him.
- `event endAparam(pkey)`, which means that Alice believes she has successfully completed the protocol with Bob. This event is executed only when Alice believes she runs the protocol with Bob, that is, when pkX = pkB. Alice supplies her public key pk(skA) as the parameter.
- `event beginBparam(pkey)`, which denotes Alice's intention to initiate the protocol with an interlocutor whose public key is supplied as a parameter.
- `event endBparam(pkey)`, which records Bob's belief that he has completed the protocol with Alice. He supplies his public key pk(skB) as the parameter.

Intuitively, if Alice believes she has completed the protocol with Bob and hence executes the event endAparam(pk(skA)), then there should have been an earlier occurrence of the event beginAparam(pk(skA)), indicating that Bob started a session with Alice; moreover, the relationship should be injective. A similar property should hold for Bob.

In addition, we wish to test if, at the end of the protocol, the nonces Na and Nb are secret. These nonces are names created by new or variables such as NX and NY, while the standard secrecy queries of ProVerif deal with the secrecy of private free names. To solve this problem, we can use the following general technique: instead of directly testing the secrecy of the nonces, we use them as session keys in order to encrypt some free name and test the secrecy of that free name. For instance, in the process for Alice, we output senc(secretANa,Na) and we test the secrecy of secretANa: secretANa is secret if and only if the nonce Na that Alice has is secret. Similarly, we output senc(secretANb,NX) and we test the secrecy of secretANb: secretANb is secret if and only if NX (that is, the nonce Nb that Alice has) is secret. We proceed symmetrically for Bob using secretBNa and secretBNb. (Alternatively, we could also define a variable NaA to store the nonce Na that Alice has at the end of the protocol, and test its secrecy using the query `query secret NaA`. We can proceed similarly using NbA to store the nonce Nb on Alice's side, and NaB and NbB to store the nonces on Bob's side. This is done in the file docs/NeedhamSchroederPK-var5.pv.)

Observe that the use of four names secretANa, secretANb, secretBNa, secretBNb for secrecy queries allows us to analyze the precise point of failure; that is, we can study secrecy for Alice and secrecy for Bob. Moreover, we can analyze both nonces Na and Nb independently for each of Alice and Bob.

The corresponding ProVerif code annotated with events and additional code to model secrecy, along with the relevant queries, is presented as follows (file docs/NeedhamSchroederPK-var1.pv):

```proverif
23 (* Authentication queries *)
24 event beginBparam(pkey).
25 event endBparam(pkey).
26 event beginAparam(pkey).
27 event endAparam(pkey).
28
29 query x: pkey; inj-event(endBparam(x)) ==> inj-event(beginBparam(x)).
30 query x: pkey; inj-event(endAparam(x)) ==> inj-event(beginAparam(x)).
31
32 (* Secrecy queries *)
33 free secretANa, secretANb, secretBNa, secretBNb: bitstring [private].
34
35 query attacker(secretANa);
36        attacker(secretANb);
37        attacker(secretBNa);
38        attacker(secretBNb).
39
40 (* Alice *)
41 let processA(pkB: pkey, skA: skey) =
42    in(c, pkX: pkey);
43    event beginBparam(pkX);
44    new Na: bitstring;
45    out(c, aenc((Na, pk(skA)), pkX));
46    in(c, m: bitstring);
47    let (=Na, NX: bitstring) = adec(m, skA) in
48    out(c, aenc(NX, pkX));
49    if pkX = pkB then
50    event endAparam(pk(skA));
51    out(c, senc(secretANa, Na));
52    out(c, senc(secretANb, NX)).
53
54 (* Bob *)
55 let processB(pkA: pkey, skB: skey) =
56    in(c, m: bitstring);
57    let (NY: bitstring, pkY: pkey) = adec(m, skB) in
58    event beginAparam(pkY);
59    new Nb: bitstring;
60    out(c, aenc((NY, Nb), pkY));
61    in(c, m3: bitstring);
62    if Nb = adec(m3, skB) then
63    if pkY = pkA then
64    event endBparam(pk(skB));
65    out(c, senc(secretBNa, NY));
66    out(c, senc(secretBNb, Nb)).
67
68 (* Main *)
69 process
70    new skA: skey; let pkA = pk(skA) in out(c, pkA);
71    new skB: skey; let pkB = pk(skB) in out(c, pkB);
72    ( (!processA(pkB, skA)) | (!processB(pkA, skB)) )
```

Analyzing the simplified Needham-Schroeder protocol. Executing the Needham-Schroeder protocol with the command `./proverif docs/NeedhamSchroederPK-var1.pv | grep "RES"` produces the output:

```
RESULT not attacker(secretANa[]) is true.
RESULT not attacker(secretANb[]) is true.
RESULT not attacker(secretBNa[]) is false.
RESULT not attacker(secretBNb[]) is false.
RESULT inj-event(endAparam(x_569)) ==> inj-event(beginAparam(x_569)) is true.
RESULT inj-event(endBparam(x_999)) ==> inj-event(beginBparam(x_999)) is false.
```

As we would expect, this means that the authentication of B to A and secrecy for A hold; whereas authentication of A to B and secrecy for B are violated. Notice how the use of four independent queries for secrecy makes the task of evaluating the output easier. In addition, we learn

```
RESULT event(endBparam(x_1486)) ==> event(beginBparam(x_1486)) is false.
```

which means that even the non-injective authentication of A to B is false; that is, Bob may end the protocol thinking he talks to Alice while Alice has never run the protocol with Bob. For the query attacker(secretBNa[]), ProVerif returns the following trace of an attack:

```
1  new skA creating skA_411 at {1}
2    out(c, pk(skA_411)) at {3}
3  new skB creating skB_412 at {4}
4    out(c, pk(skB_412)) at {6}
5    in(c, pk(a)) at {8} in copy a_408
6    event(beginBparam(pk(a))) at {9} in copy a_408
7  new Na creating Na_410 at {10} in copy a_408
8    out(c, aenc((Na_410, pk(skA_411)), pk(a))) at {11} in copy a_408
9    in(c, aenc((Na_410, pk(skA_411)), pk(skB_412))) at {20} in copy a_409
10   event(beginAparam(pk(skA_411))) at {22} in copy a_409
11 new Nb creating Nb_413 at {23} in copy a_409
12   out(c, aenc((Na_410, Nb_413), pk(skA_411))) at {24} in copy a_409
13   in(c, aenc((Na_410, Nb_413), pk(skA_411))) at {12} in copy a_408
14   out(c, aenc(Nb_413, pk(a))) at {14} in copy a_408
15   in(c, aenc(Nb_413, pk(skB_412))) at {25} in copy a_409
16   event(endBparam(pk(skB_412))) at {28} in copy a_409
17   out(c, senc(secretBNa, Na_410)) at {29} in copy a_409
18   out(c, senc(secretBNb, Nb_413)) at {30} in copy a_409
19   The attacker has the message secretBNa.
```

This trace corresponds to Lowe's attack. The first two new and outputs correspond to the creation of the secret keys and outputs of the public keys of A and B in the main process. Next, processA starts, inputting the public key pk(a) of its interlocutor: a has been generated by the attacker, so this interlocutor is dishonest. A then sends the first message of the protocol aenc((Na_410, pk(skA_411)), pk(a)) (Line 8 of the trace). This message is received by B after having been decrypted and reencrypted under pkB by the attacker. It looks like a message for a session between A and B, B replies with aenc((Na_410, Nb_413), pk(skA_411)) which is then received by A. A replies with aenc(Nb_413, pk(a)). This message is again received by B after having been decrypted and reencrypted under pkB by the attacker. B has then apparently concluded a session with A, so it sends senc(secretBNa, Na_410). The attacker has obtained Na_410 by decrypting the message aenc((Na_410, pk(skA_411)), pk(a)) (sent at Line 8 of the trace), so it can compute secretBNa, thus breaking secrecy. The traces found for the other queries are similar.

## 5.2 Full Needham-Schroeder protocol

In this section, we will present a model of the full protocol and will demonstrate the use of some ProVerif features. (A more generic model is presented in Section 5.3.) In this formalization, we preserve the types of the Needham-Schroeder protocol more closely. In particular, we model the type nonce (rather than bitstring) and we introduce the type host for participants identities. Accordingly, we make use of type conversion where necessary. Since the modeling process should now be familiar, we present the complete encoding, which can be found in the file docs/NeedhamSchroederPK-var2.pv, and then discuss particular aspects.

```proverif
1   free c: channel.
2
3   (* Public key encryption *)
4   type pkey.
5   type skey.
6
7   fun pk(skey): pkey.
8   fun aenc(bitstring, pkey): bitstring.
9   reduc forall x: bitstring, y: skey; adec(aenc(x, pk(y)), y) = x.
10
11  (* Signatures *)
12  type spkey.
13  type sskey.
14
15  fun spk(sskey): spkey.
16  fun sign(bitstring, sskey): bitstring.
17  reduc forall x: bitstring, y: sskey; getmess(sign(x,y)) = x.
18  reduc forall x: bitstring, y: sskey; checksign(sign(x,y), spk(y)) = x.
19
20  (* Shared key encryption *)
21  type nonce.
22
23  fun senc(bitstring, nonce): bitstring.
24  reduc forall x: bitstring, y: nonce; sdec(senc(x,y),y) = x.
25
26  (* Type converter *)
27  fun nonce_to_bitstring(nonce): bitstring [data,typeConverter].
28
29  (* Two honest host names A and B *)
30  type host.
31  free A, B: host.
32
33  (* Key table *)
34  table keys(host, pkey).
35
36  (* Authentication queries *)
37  event beginBparam(host).
38  event endBparam(host).
39  event beginAparam(host).
40  event endAparam(host).
41
42  query x: host; inj-event(endBparam(x)) ==> inj-event(beginBparam(x)).
43  query x: host; inj-event(endAparam(x)) ==> inj-event(beginAparam(x)).
44
45  (* Secrecy queries *)
46  free secretANa, secretANb, secretBNa, secretBNb: bitstring [private].
47
48  query attacker(secretANa);
49            attacker(secretANb);
50            attacker(secretBNa);
51            attacker(secretBNb).
52
53  (* Alice *)
54  let processA(pkS: spkey, skA: skey) =
55     in(c, hostX: host);
56     event beginBparam(hostX);
57     out(c, (A, hostX));                                            (* msg 1 *)
58     in(c, ms: bitstring);                                         (* msg 2 *)
59     let (pkX: pkey, =hostX) = checksign(ms, pkS) in
60     new Na: nonce;
61     out(c, aenc((Na, A), pkX));                                    (* msg 3 *)
62     in(c, m: bitstring);                                          (* msg 6 *)
63     let (=Na, NX: nonce) = adec(m, skA) in
64     out(c, aenc(nonce_to_bitstring(NX), pkX));                     (* msg 7 *)
65     if hostX = B then
66     event endAparam(A);
67     out(c, senc(secretANa, Na));
68     out(c, senc(secretANb, NX)).
69
70  (* Bob *)
71  let processB(pkS: spkey, skB: skey) =
72     in(c, m: bitstring);                                          (* msg 3 *)
73     let (NY: nonce, hostY: host) = adec(m, skB) in
74     event beginAparam(hostY);
75     out(c, (B, hostY));                                            (* msg 4 *)
76     in(c, ms: bitstring);                                         (* msg 5 *)
77     let (pkY: pkey, =hostY) = checksign(ms, pkS) in
78     new Nb: nonce;
79     out(c, aenc((NY, Nb), pkY));                                   (* msg 6 *)
80     in(c, m3: bitstring);                                         (* msg 7 *)
81     if nonce_to_bitstring(Nb) = adec(m3, skB) then
82     if hostY = A then
83     event endBparam(B);
84     out(c, senc(secretBNa, NY));
85     out(c, senc(secretBNb, Nb)).
86
87  (* Trusted key server *)
88  let processS(skS: sskey) =
89     in(c, (a: host, b: host));
90     get keys(=b, sb) in
91     out(c, sign((sb, b), skS)).
92
93  (* Key registration *)
94  let processK =
95     in(c, (h: host, k: pkey));
96     if h <> A && h <> B then insert keys(h,k).
97
98  (* Main *)
99  process
100    new skA: skey; let pkA = pk(skA) in out(c, pkA); insert keys(A, pkA);
101    new skB: skey; let pkB = pk(skB) in out(c, pkB); insert keys(B, pkB);
102    new skS: sskey; let pkS = spk(skS) in out(c, pkS);
103    ( (!processA(pkS, skA)) | (!processB(pkS, skB)) |
104      (!processS(skS)) | (!processK) )
```

This process uses a key table in order to relate host names and their public keys. The key table is declared by table keys(host, pkey). Keys are inserted in the key table in the main process (for the honest hosts A and B, by insert keys(A, pkA) and insert keys(B, pkB)) and in a key registration process processK for dishonest hosts. The key server processS looks up the key corresponding to host b by get keys(=b, sb) in order to build the corresponding certificate. Since Alice is willing to run the protocol with any other participant and she will request her interlocutor's public key from the key server, we must permit the attacker to register keys with the trusted key server (that is, insert keys into the key table). This behavior is captured by the key registration process processK. Observe that the conditional if h <> A && h <> B then prevents the attacker from changing the keys belonging to Alice and Bob. (Recall that when several records are matched by a get query, then one possibility is chosen, but ProVerif considers all possibilities when reasoning; without the conditional, the attacker can therefore effectively change the keys belonging to Alice and Bob.)

Evaluating security properties of the Needham-Schroeder protocol. Once again ProVerif is able to conclude that authentication of B to A and secrecy for A hold, whereas authentication of A to B and secrecy for B are violated. We omit analyzing the output produced by ProVerif and leave this as an exercise for the reader.

## 5.3 Generalized Needham-Schroeder protocol

In the previous section, we considered an undesirable restriction on the participants; namely that the initiator was played by Alice using the public key pk(skA) and the responder played by Bob using the public key pk(skB). In this section, we generalize our encoding. Additionally, we also model authentication as full agreement, that is, agreement on all protocol parameters. The reader will also notice that we use encrypt and decrypt instead of aenc and adec, and sencrypt and sdecrypt instead of senc and sdec. The following script can be found in the file docs/NeedhamSchroederPK-var3.pv.

```proverif
1    (* Loops if types are ignored *)
2    set ignoreTypes = false.
3
4    free c: channel.
5
6    type host.
7    type nonce.
8    type pkey.
9    type skey.
10   type spkey.
11   type sskey.
12
13   fun nonce_to_bitstring(nonce): bitstring [data,typeConverter].
14
15   (* Public key encryption *)
16   fun pk(skey): pkey.
17   fun encrypt(bitstring, pkey): bitstring.
18   reduc forall x: bitstring, y: skey; decrypt(encrypt(x,pk(y)), y) = x.
19
20   (* Signatures *)
21   fun spk(sskey): spkey.
22   fun sign(bitstring, sskey): bitstring.
23   reduc forall m: bitstring, k: sskey; getmess(sign(m,k)) = m.
24   reduc forall m: bitstring, k: sskey; checksign(sign(m,k), spk(k)) = m.
25
26   (* Shared key encryption *)
27   fun sencrypt(bitstring, nonce): bitstring.
28   reduc forall x: bitstring, y: nonce; sdecrypt(sencrypt(x,y),y) = x.
29
30   (* Secrecy assumptions *)
31   not attacker(new skA).
32   not attacker(new skB).
33   not attacker(new skS).
34
35   (* 2 honest host names A and B *)
36   free A, B: host.
37
38   table keys(host, pkey).
39
40   (* Queries *)
41   free secretANa, secretANb, secretBNa, secretBNb: bitstring [private].
42   query attacker(secretANa);
43             attacker(secretANb);
44             attacker(secretBNa);
45             attacker(secretBNb).
46
47   event beginBparam(host, host).
48   event endBparam(host, host).
49   event beginAparam(host, host).
50   event endAparam(host, host).
51   event beginBfull(host, host, pkey, pkey, nonce, nonce).
52   event endBfull(host, host, pkey, pkey, nonce, nonce).
53   event beginAfull(host, host, pkey, pkey, nonce, nonce).
54   event endAfull(host, host, pkey, pkey, nonce, nonce).
55
56   query x: host, y: host;
57        inj-event(endBparam(x,y)) ==> inj-event(beginBparam(x,y)).
58
59   query x1: host, x2: host, x3: pkey, x4: pkey, x5: nonce, x6: nonce;
60        inj-event(endBfull(x1,x2,x3,x4,x5,x6))
61            ==> inj-event(beginBfull(x1,x2,x3,x4,x5,x6)).
62
63   query x: host, y: host;
64        inj-event(endAparam(x,y)) ==> inj-event(beginAparam(x,y)).
65
66   query x1: host, x2: host, x3: pkey, x4: pkey, x5: nonce, x6: nonce;
67        inj-event(endAfull(x1,x2,x3,x4,x5,x6))
68            ==> inj-event(beginAfull(x1,x2,x3,x4,x5,x6)).
69
70   (* Role of the initiator with identity xA and secret key skxA *)
71   let processInitiator(pkS: spkey, skA: skey, skB: skey) =
72       (* The attacker starts the initiator by choosing identity xA,
73            and its interlocutor xB0.
74         We check that xA is honest (i.e. is A or B)
75            and get its corresponding key. *)
76       in(c, (xA: host, hostX: host));
77       if xA = A || xA = B then
78       let skxA = if xA = A then skA else skB in
79       let pkxA = pk(skxA) in
80       (* Real start of the role *)
81       event beginBparam(xA, hostX);
82       (* Message 1: Get the public key certificate for the other host *)
83       out(c, (xA, hostX));
84       (* Message 2 *)
85       in(c, ms: bitstring);
86       let (pkX: pkey, =hostX) = checksign(ms,pkS) in
87       (* Message 3 *)
88       new Na: nonce;
89       out(c, encrypt((Na, xA), pkX));
90       (* Message 6 *)
91       in(c, m: bitstring);
92       let (=Na, NX2: nonce) = decrypt(m, skxA) in
93       event beginBfull(xA, hostX, pkX, pkxA, Na, NX2);
94       (* Message 7 *)
95       out(c, encrypt(nonce_to_bitstring(NX2), pkX));
96       (* OK *)
97       if hostX = B || hostX = A then
98       event endAparam(xA, hostX);
99       event endAfull(xA, hostX, pkX, pkxA, Na, NX2);
100      out(c, sencrypt(secretANa, Na));
101      out(c, sencrypt(secretANb, NX2)).
102
103  (* Role of the responder with identity xB and secret key skxB *)
104  let processResponder(pkS: spkey, skA: skey, skB: skey) =
105      (* The attacker starts the responder by choosing identity xB.
106           We check that xB is honest (i.e. is A or B). *)
107      in(c, xB: host);
108      if xB = A || xB = B then
109      let skxB = if xB = A then skA else skB in
110      let pkxB = pk(skxB) in
111      (* Real start of the role *)
112      (* Message 3 *)
113      in(c, m: bitstring);
114      let (NY: nonce, hostY: host) = decrypt(m, skxB) in
115      event beginAparam(hostY, xB);
116      (* Message 4: Get the public key certificate for the other host *)
117      out(c, (xB, hostY));
118      (* Message 5 *)
119      in(c, ms: bitstring);
120      let (pkY: pkey, =hostY) = checksign(ms,pkS) in
121      (* Message 6 *)
122      new Nb: nonce;
123      event beginAfull(hostY, xB, pkxB, pkY, NY, Nb);
124      out(c, encrypt((NY, Nb), pkY));
125      (* Message 7 *)
126      in(c, m3: bitstring);
127      if nonce_to_bitstring(Nb) = decrypt(m3, skB) then
128      (* OK *)
129      if hostY = A || hostY = B then
130      event endBparam(hostY, xB);
131      event endBfull(hostY, xB, pkxB, pkY, NY, Nb);
132      out(c, sencrypt(secretBNa, NY));
133      out(c, sencrypt(secretBNb, Nb)).
134
135  (* Server *)
136  let processS(skS: sskey) =
137     in(c, (a: host, b: host));
138     get keys(=b, sb) in
139     out(c, sign((sb, b), skS)).
140
141  (* Key registration *)
142  let processK =
143     in(c, (h: host, k: pkey));
144     if h <> A && h <> B then insert keys(h,k).
145
146  (* Main *)
147  process
148     new skA: skey; let pkA = pk(skA) in out(c, pkA); insert keys(A, pkA);
149     new skB: skey; let pkB = pk(skB) in out(c, pkB); insert keys(B, pkB);
150     new skS: sskey; let pkS = spk(skS) in out(c, pkS);
151     (
152        (* Launch an unbounded number of sessions of the initiator *)
153        (! processInitiator(pkS, skA, skB)) |
154        (* Launch an unbounded number of sessions of the responder *)
155        (! processResponder(pkS, skA, skB)) |
156        (* Launch an unbounded number of sessions of the server *)
157        (! processS(skS)) |
158        (* Key registration process *)
159        (! processK)
160     )
```

The main novelty of this script is that it allows Alice and Bob to play both roles of the initiator and responder. To achieve this, we could simply duplicate the code, but it is possible to have more elegant encodings. Above, we consider processes processInitiator and processResponder that take as argument both skA and skB (since they can be played by Alice and Bob). Looking for instance at the initiator (Lines 71–79), the attacker first starts the initiator by sending the identity xA of the principal playing the role of the initiator and hostX of its interlocutor. Then, we verify that the initiator is honest, and compute its secret key skxA (skA for A, skB for B) and its corresponding public key pkxA = pk(skxA). We can then run the role as expected. We proceed similarly for the responder.

Other encodings are also possible. For instance, we could define a destructor choosekey by

```proverif
fun choosekey(host, host, host, skey, skey): skey
reduc forall x1: host, x2: host, sk1: skey, sk2: skey;
            choosekey(x1, x1, x2, sk1, sk2) = sk1
otherwise forall x1: host, x2: host, sk1: skey, sk2: skey;
            choosekey(x2, x1, x2, sk1, sk2) = sk2.
```

and let skxA be choosekey(xA, A, B, skA, skB) (if xA = A, it returns skA; if xA = B, it returns skB; otherwise, it fails). The latter encoding is perhaps less intuitive, but it avoids internal code duplication when ProVerif expands tests that appear in terms.

Three other points are worth noting:

- We use secrecy assumptions (Lines 30–33) to speed up the resolution process of ProVerif. These lines inform ProVerif that the attacker cannot have the secret keys skA, skB, skS. This information is checked by ProVerif, so that erroneous proofs cannot be obtained even with secrecy assumptions. (See also Section 6.7.2.) Lines 30–33 can be removed without changing the results, ProVerif will just be slightly slower.
- We set ignoreTypes to false (Lines 1–2). By default, ProVerif ignore all types during analysis. However, for this script, it does not terminate with this default setting. By setting ignoreTypes = false, the semantics of processes is changed to check the types. This setting makes it possible to obtain termination. The known attack against this protocol is detected, but it might happen that some type flaw attacks are undetected, when they appear when the types are not checked in processes. More details on the ignoreTypes setting can be found in Section 6.6.2. There are other ways of obtaining termination in this example, in particular by using a different method for relating identities and keys with two function symbols, one that maps the key to the identity, and one that maps the identity to the key. However, this method also has limitations: it does not allow the attacker to create two principals with the same key. More information on this method can be found in Section 6.7.3.
- We use two different levels of authentication: the events that end with "full" serve in proving Lowe's full agreement [Low97], that is, agreement on all parameters of the protocol (here, host names, keys, and nonces). The events that end with "param" prove agreement on the host names only.

As expected, ProVerif is able to prove the authentication of the responder and secrecy for the initiator; whereas authentication of the initiator and secrecy for the responder fail. The reader is invited to modify the protocol according to Lowe's fix and examine the results produced by ProVerif. (A script for the corrected protocol can be found in examples/pitype/secr-auth/NeedhamSchroederPK-corr.pv. If you installed by OPAM in the switch ⟨switch⟩, it is in `~/.opam/⟨switch⟩/doc/proverif/examples/pitype/secr-auth/NeedhamSchroederPK-corr.pv`. Note that the fixed protocol can be proved correct by ProVerif even when types are ignored.)

## 5.4 Variants of these security properties

In this section, we consider several security properties of Lowe's corrected version of the Needham-Schroeder public key protocol.

### 5.4.1 A variant of mutual authentication

In the previous definitions of authentication that we have considered, we require that internal parameters of the protocol (such as nonces) are the same for the initiator and for the responder. However, in the computational model, one generally uses a session identifier that is publicly computable (such as the tuple of the messages of the protocol) as argument of events. One can also do that in ProVerif, as in the following example (file docs/NeedhamSchroederPK-corr-mutual-auth.pv).

```proverif
1   (* Queries *)
2   fun messtermI(host, host): bitstring [data].
3   fun messtermR(host, host): bitstring [data].
4
5   event termI(host, host, bitstring).
6   event acceptsI(host, host, bitstring).
7   event acceptsR(host, host, bitstring).
8   event termR(host, host, bitstring).
9
10  query x: host, m: bitstring;
11            inj-event(termI(x,B,m)) ==> inj-event(acceptsR(x,B,m)).
12  query x: host, m: bitstring;
13            inj-event(termR(A,x,m)) ==> inj-event(acceptsI(A,x,m)).
14
15  (* Role of the initiator with identity xA and secret key skxA *)
16  let processInitiator(pkS: spkey, skA: skey, skB: skey) =
17     (* The attacker starts the initiator by choosing identity xA,
18          and its interlocutor xB0.
19       We check that xA is honest (i.e. is A or B)
20          and get its corresponding key.
21     *)
22     in(c, (xA: host, hostX: host));
23     if xA = A || xA = B then
24     let skxA = if xA = A then skA else skB in
25     let pkxA = pk(skxA) in
26     (* Real start of the role *)
27     (* Message 1: Get the public key certificate for the other host *)
28     out(c, (xA, hostX));
29     (* Message 2 *)
30     in(c, ms: bitstring);
31     let (pkX: pkey, =hostX) = checksign(ms,pkS) in
32     (* Message 3 *)
33     new Na: nonce;
34     let m3 = encrypt((Na, xA), pkX) in
35     out(c, m3);
36     (* Message 6 *)
37     in(c, m: bitstring);
38     let (=Na, NX2: nonce, =hostX) = decrypt(m, skA) in
39     let m7 = encrypt(nonce_to_bitstring(NX2), pkX) in
40     event termI(xA, hostX, (m3, m));
41     event acceptsI(xA, hostX, (m3, m, m7));
42     (* Message 7 *)
43     out(c, (m7, messtermI(xA, hostX))).
44
45  (* Role of the responder with identity xB and secret key skxB *)
46  let processResponder(pkS: spkey, skA: skey, skB: skey) =
47     (* The attacker starts the responder by choosing identity xB.
48          We check that xB is honest (i.e. is A or B). *)
49     in(c, xB: host);
50     if xB = A || xB = B then
51     let skxB = if xB = A then skA else skB in
52     let pkxB = pk(skxB) in
53     (* Real start of the role *)
54     (* Message 3 *)
55     in(c, m: bitstring);
56     let (NY: nonce, hostY: host) = decrypt(m, skxB) in
57     (* Message 4: Get the public key certificate for the other host *)
58     out(c, (xB, hostY));
59     (* Message 5 *)
60     in(c, ms: bitstring);
61     let (pkY: pkey, =hostY) = checksign(ms,pkS) in
62     (* Message 6 *)
63     new Nb: nonce;
64     let m6 = encrypt((NY, Nb, xB), pkY) in
65     event acceptsR(hostY, xB, (m, m6));
66     out(c, m6);
67     (* Message 7 *)
68     in(c, m3: bitstring);
69     if nonce_to_bitstring(Nb) = decrypt(m3, skB) then
70     event termR(hostY, xB, (m, m6, m3));
71     out(c, messtermR(hostY, xB)).
72
73  (* Server *)
74  let processS(skS: sskey) =
75     in(c, (a: host, b: host));
76     get keys(=b, sb) in
77     out(c, sign((sb, b), skS)).
78
79  (* Key registration *)
80  let processK =
81     in(c, (h: host, k: pkey));
82     if h <> A && h <> B then insert keys(h,k).
83
84  (* Start process *)
85  process
86     new skA: skey; let pkA = pk(skA) in out(c, pkA); insert keys(A, pkA);
87     new skB: skey; let pkB = pk(skB) in out(c, pkB); insert keys(B, pkB);
88     new skS: sskey; let pkS = spk(skS) in out(c, pkS);
89     (
90        (* Launch an unbounded number of sessions of the initiator *)
91        (! processInitiator(pkS, skA, skB)) |
92        (* Launch an unbounded number of sessions of the responder *)
93        (! processResponder(pkS, skA, skB)) |
94        (* Launch an unbounded number of sessions of the server *)
95        (! processS(skS)) |
96        (* Key registration process *)
97        (! processK)
98     )
```

The query

```
10 query x: host, m: bitstring;
11           inj-event(termI(x,B,m)) ==> inj-event(acceptsR(x,B,m)).
```

corresponds to the authentication of the responder B to the initiator x: when the initiator x terminates a session apparently with B (event termI(x,B,m), executed at Line 40, when the initiator terminates, after receiving its last message, message 6), the responder B has accepted with x (event acceptsR(x,B,m), executed at Line 65, when the responder accepts, just before sending message 6). We use a fixed value B for the name of the responder, and not a variable, because if a variable were used, the initiator might run a session with a dishonest participant included in the attacker, and in this case, it is perfectly ok that the event acceptsR is not executed. Since the initiator is executed with identities A and B, x is either A or B, so the query above proves correct authentication of the responder B to the initiator x when x is A and when it is B. The same property for the responder A holds by symmetry, swapping A and B.

Similarly, the query

```
12 query x: host, m: bitstring;
13           inj-event(termR(A,x,m)) ==> inj-event(acceptsI(A,x,m)).
```

corresponds to the authentication of the initiator A to the responder x: when the responder x terminates a session apparently with A (event termR(A,x,m), executed at Line 70, when the responder terminates, after receiving its last message, message 7), the initiator A has accepted with x (event acceptsI(A,x,m), executed at Line 41, when the initiator accepts, just before sending message 7).

The position of events follows Figure 3.4. The events termR and acceptsI take as arguments the host names of the initiator and the responder, and the tuples of messages exchanged between the initiator and the responder. (Messages sent to or received from the server to obtain the certificates are ignored.) Because the last message is from the initiator to the responder, that message is not known to the responder when it accepts, so that message is omitted from the arguments of the events acceptsR and termI.

### 5.4.2 Authenticated key exchange

In the computational model, the security of an authenticated key exchange protocol is typically shown by proving, in addition to mutual authentication, that the exchanged key is indistinguishable from a random key. More precisely, in the real-or-random model [AFP06], one allows the attacker to perform several test queries, which either return the real key or a fresh random key, and these two cases must be indistinguishable. When the test query is performed on a session between a honest and a dishonest participant, the returned key is always the real one. When the test query is performed several times on the same session, or on the partner session (that is, the session of the interlocutor that has the same session identifier), it returns the same key (whether real or random). Taking into account partnering in the definition of test queries is rather tricky, so we have developed an alternative characterization that does not require partnering [Bla07].

We use events similar to those for mutual authentication, except that termR and acceptsI take the exchanged key as an additional argument. We prove the following properties:

```proverif
query x: host, m: bitstring;
         inj-event(termI(x,B,m)) ==> inj-event(acceptsR(x,B,m)).
query x: host, k: nonce, m: bitstring;
         inj-event(termR(A,x,k,m)) ==> inj-event(acceptsI(A,x,k,m)).
query x: host, k: nonce, k': nonce, m: bitstring;
         event(termR(A,x,k,m)) && event(acceptsI(A,x,k',m)) ==> k = k'.
```

When the initiator or the responder execute a session with a dishonest participant, they output the exchanged key. (This key is also output by the test queries in this case.) We show the secrecy of the keys established by the initiator when it runs sessions with a honest responder, in the sense that these keys are indistinguishable from independent random numbers.

The first two correspondences imply mutual authentication. The real-or-random indistinguishability of the key is obtained by combining the last two correspondences with the secrecy of the initiator's key. Intuitively, the correspondences allow us to show that each responder's key in a session with a honest initiator is in fact also an initiator's key (which we can find by looking for the same session identifier), so showing that the initiator's key cannot be distinguished from independent random numbers is sufficient to show the secrecy of the key.

Outputting the exchanged key in a session with a dishonest interlocutor allows to detect Unknown Key Share (UKS) attacks [DvOW92], in which an initiator A believes he shares a key with a responder B, but B believes he shares that key with a dishonest C. This key is then output to the attacker, so the secrecy of the initiator's key is broken. However, bilateral UKS attacks [CT08], in which A shares a key with a dishonest C and B shares the same key with a dishonest D, may remain undetected under this definition of key exchange. These attacks can be detected by testing the following correspondence:

```proverif
query x: host, y: host, x': host, y': host, k: nonce, k': nonce,
    m: bitstring, m': bitstring;
     event(termR(x,y,k,m)) && event(acceptsI(x',y',k,m')) ==> x = x' && y = y'.
```

to verify that, if two sessions terminate with the same key, then they are between the same hosts (and we could additionally verify m = m' to make sure that these sessions have the same session identifiers).

The following script aims at verifying this notion of authenticated key exchange, assuming that the exchanged key is Na (file docs/NeedhamSchroederPK-corr-ake.pv).

```proverif
1   (* Queries *)
2   free secretA: bitstring [private].
3   query attacker(secretA).
4
5   fun messtermI(host, host): bitstring [data].
6   fun messtermR(host, host): bitstring [data].
7
8   event termI(host, host, bitstring).
9   event acceptsI(host, host, nonce, bitstring).
10  event acceptsR(host, host, bitstring).
11  event termR(host, host, nonce, bitstring).
12
13  query x: host, m: bitstring;
14            inj-event(termI(x,B,m)) ==> inj-event(acceptsR(x,B,m)).
15  query x: host, k: nonce, m: bitstring;
16            inj-event(termR(A,x,k,m)) ==> inj-event(acceptsI(A,x,k,m)).
17
18  query x: host, k: nonce, k': nonce, m: bitstring;
19            event(termR(A,x,k,m)) && event(acceptsI(A,x,k',m)) ==> k = k'.
20
21  (* Query for detecting bilateral UKS attacks *)
22  query x: host, y: host, x': host, y': host, k: nonce, k': nonce,
23      m: bitstring, m': bitstring;
24       event(termR(x,y,k,m)) && event(acceptsI(x',y',k,m')) ==> x = x' && y = y'.
25
26  (* Role of the initiator with identity xA and secret key skxA *)
27  let processInitiator(pkS: spkey, skA: skey, skB: skey) =
28      (* The attacker starts the initiator by choosing identity xA,
29            and its interlocutor xB0.
30         We check that xA is honest (i.e. is A or B)
31            and get its corresponding key.
32     *)
33     in(c, (xA: host, hostX: host));
34     if xA = A || xA = B then
35     let skxA = if xA = A then skA else skB in
36     let pkxA = pk(skxA) in
37     (* Real start of the role *)
38     (* Message 1: Get the public key certificate for the other host *)
39     out(c, (xA, hostX));
40     (* Message 2 *)
41     in(c, ms: bitstring);
42     let (pkX: pkey, =hostX) = checksign(ms,pkS) in
43     (* Message 3 *)
44     new Na: nonce;
45     let m3 = encrypt((Na, xA), pkX) in
46     out(c, m3);
47     (* Message 6 *)
48     in(c, m: bitstring);
49     let (=Na, NX2: nonce, =hostX) = decrypt(m, skA) in
50     let m7 = encrypt(nonce_to_bitstring(NX2), pkX) in
51     event termI(xA, hostX, (m3, m));
52     event acceptsI(xA, hostX, Na, (m3, m, m7));
53     (* Message 7 *)
54     if hostX = A || hostX = B then
55     (
56         out(c, sencrypt(secretA, Na));
57         out(c, (m7, messtermI(xA, hostX)))
58     )
59     else
60     (
61         out(c, Na);
62         out(c, (m7, messtermI(xA, hostX)))
63     ).
64
65  (* Role of the responder with identity xB and secret key skxB *)
66  let processResponder(pkS: spkey, skA: skey, skB: skey) =
67     (* The attacker starts the responder by choosing identity xB.
68          We check that xB is honest (i.e. is A or B). *)
69     in(c, xB: host);
70     if xB = A || xB = B then
71     let skxB = if xB = A then skA else skB in
72     let pkxB = pk(skxB) in
73     (* Real start of the role *)
74     (* Message 3 *)
75     in(c, m: bitstring);
76     let (NY: nonce, hostY: host) = decrypt(m, skxB) in
77     (* Message 4: Get the public key certificate for the other host *)
78     out(c, (xB, hostY));
79     (* Message 5 *)
80     in(c, ms: bitstring);
81     let (pkY: pkey, =hostY) = checksign(ms,pkS) in
82     (* Message 6 *)
83     new Nb: nonce;
84     let m6 = encrypt((NY, Nb, xB), pkY) in
85     event acceptsR(hostY, xB, (m, m6));
86     out(c, m6);
87     (* Message 7 *)
88     in(c, m3: bitstring);
89     if nonce_to_bitstring(Nb) = decrypt(m3, skB) then
90     event termR(hostY, xB, NY, (m, m6, m3));
91     if hostY = A || hostY = B then
92         out(c, messtermR(hostY, xB))
93     else
94     (
95         out(c, NY);
96         out(c, messtermR(hostY, xB))
97     ).
98
99  (* Server *)
100 let processS(skS: sskey) =
101     in(c, (a: host, b: host));
102     get keys(=b, sb) in
103     out(c, sign((sb, b), skS)).
104
105 (* Key registration *)
106 let processK =
107     in(c, (h: host, k: pkey));
108     if h <> A && h <> B then insert keys(h,k).
109
110 (* Start process *)
111 process
112     new skA: skey; let pkA = pk(skA) in out(c, pkA); insert keys(A, pkA);
113     new skB: skey; let pkB = pk(skB) in out(c, pkB); insert keys(B, pkB);
114     new skS: sskey; let pkS = spk(skS) in out(c, pkS);
115     (
116         (* Launch an unbounded number of sessions of the initiator *)
117         (! processInitiator(pkS, skA, skB)) |
118         (* Launch an unbounded number of sessions of the responder *)
119         (! processResponder(pkS, skA, skB)) |
120         (* Launch an unbounded number of sessions of the server *)
121         (! processS(skS)) |
122         (* Key registration process *)
123         (! processK)
124     )
```

ProVerif finds a bilateral UKS attack: if C as responder runs a session with A, it gets Na, then D as initiator can use the same nonce Na in a session with responder B, thus obtaining two sessions, between A and C and between D and B, that share the same key Na. (Such an attack appears more generally when the key is determined by a single participant of the protocol.) The other properties are proved by ProVerif.

The above script verifies syntactic secrecy of the initiator's key Na. To be even closer to the computational definition, we can verify its secrecy using the real-or-random secrecy notion (page 60), as in the following script (file docs/NeedhamSchroederPK-corr-ake-RoR.pv):

```proverif
1   (* Termination messages *)
2   fun messtermI(host, host): bitstring [data].
3   fun messtermR(host, host): bitstring [data].
4
5   set ignoreTypes = false.
6
7   (* Role of the initiator with identity xA and secret key skxA *)
8   let processInitiator(pkS: spkey, skA: skey, skB: skey) =
9       (* The attacker starts the initiator by choosing identity xA,
10            and its interlocutor xB0.
11         We check that xA is honest (i.e. is A or B)
12            and get its corresponding key.
13     *)
14     in(c, (xA: host, hostX: host));
15     if xA = A || xA = B then
16     let skxA = if xA = A then skA else skB in
17     let pkxA = pk(skxA) in
18     (* Real start of the role *)
19     (* Message 1: Get the public key certificate for the other host *)
20     out(c, (xA, hostX));
21     (* Message 2 *)
22     in(c, ms: bitstring);
23     let (pkX: pkey, =hostX) = checksign(ms,pkS) in
24     (* Message 3 *)
25     new Na: nonce;
26     let m3 = encrypt((Na, xA), pkX) in
27     out(c, m3);
28     (* Message 6 *)
29     in(c, m: bitstring);
30     let (=Na, NX2: nonce, =hostX) = decrypt(m, skA) in
31     let m7 = encrypt(nonce_to_bitstring(NX2), pkX) in
32     (* Message 7 *)
33     if hostX = A || hostX = B then
34     (
35         new random: nonce;
36         out(c, choice[Na, random]);
37         out(c, (m7, messtermI(xA, hostX)))
38     )
39     else
40     (
41         out(c, Na);
42         out(c, (m7, messtermI(xA, hostX)))
43     ).
44
45  (* Role of the responder with identity xB and secret key skxB *)
46  let processResponder(pkS: spkey, skA: skey, skB: skey) =
47     (* The attacker starts the responder by choosing identity xB.
48          We check that xB is honest (i.e. is A or B). *)
49     in(c, xB: host);
50     if xB = A || xB = B then
51     let skxB = if xB = A then skA else skB in
52     let pkxB = pk(skxB) in
53     (* Real start of the role *)
54     (* Message 3 *)
55     in(c, m: bitstring);
56     let (NY: nonce, hostY: host) = decrypt(m, skxB) in
57     (* Message 4: Get the public key certificate for the other host *)
58     out(c, (xB, hostY));
59     (* Message 5 *)
60     in(c, ms: bitstring);
61     let (pkY: pkey, =hostY) = checksign(ms,pkS) in
62     (* Message 6 *)
63     new Nb: nonce;
64     let m6 = encrypt((NY, Nb, xB), pkY) in
65     out(c, m6);
66     (* Message 7 *)
67     in(c, m3: bitstring);
68     if nonce_to_bitstring(Nb) = decrypt(m3, skB) then
69     if hostY = A || hostY = B then
70         out(c, messtermR(hostY, xB))
71     else
72     (
73         out(c, NY);
74         out(c, messtermR(hostY, xB))
75     ).
76
77  (* Server *)
78  let processS(skS: sskey) =
79     in(c, (a: host, b: host));
80     get keys(=b, sb) in
81     out(c, sign((sb, b), skS)).
82
83  (* Key registration *)
84  let processK =
85     in(c, (h: host, k: pkey));
86     if h <> A && h <> B then insert keys(h,k).
87
88  (* Start process *)
89  process
90     new skA: skey; let pkA = pk(skA) in out(c, pkA); insert keys(A, pkA);
91     new skB: skey; let pkB = pk(skB) in out(c, pkB); insert keys(B, pkB);
92     new skS: sskey; let pkS = spk(skS) in out(c, pkS);
93     (
94         (* Launch an unbounded number of sessions of the initiator *)
95         (! processInitiator(pkS, skA, skB)) |
96         (* Launch an unbounded number of sessions of the responder *)
97         (! processResponder(pkS, skA, skB)) |
98         (* Launch an unbounded number of sessions of the server *)
99         (! processS(skS)) |
100        (* Key registration process *)
101        (! processK)
102    )
```

Line 36 outputs either the real key Na or a fresh random key, and the goal is to prove that the attacker cannot distinguish these two situations. In order to obtain termination, we require that all code including the attacker be well-typed (Line 5). This prevents in particular the generation of certificates in which the host names are themselves nested signatures of unbounded depth. Unfortunately, ProVerif finds a false attack in which the output key is used to build message 3 (either encrypt((Na, A), pkB) or encrypt((random, A), pkB)), send it to the responder, which replies with message 6 (that is, encrypt((Na, Nb, A), pkA) or encrypt((random, Nb, A), pkA)), which is accepted by the initiator if and only if the key is the real key Na.

A similar verification can be done with other possible keys (for instance, Nb, h(Na), h(Nb), h(Na,Nb) where h is a hash function). We leave these verifications to the reader and just note that the false attack above disappears for the key h(Na) (but we still have to restrict ourselves to a well-typed attacker). In order to obtain this result, a trick is necessary: if random is generated at the end of the protocol, ProVerif represents it internally as a function of the previously received messages, including message 6. This leads to a false attack in which two different values of random (generated after receiving different messages 6) are associated to the same Na. This false attack can be eliminated by moving the generation of random just after the generation of Na.

### 5.4.3 Full ordering of the messages

We can also show that, if a responder terminates the protocol with a honest initiator, then all messages of the protocol between the initiator and the responder have been exchanged in the right order. (We ignore messages sent to or received from the server.) This is shown in the following script (file docs/NeedhamSchroederPK-corr-all-messages.pv).

```proverif
1   (* Queries *)
2   event endB(host, host, pkey, pkey, nonce, nonce).
3   event e3(host, host, pkey, pkey, nonce, nonce).
4   event e2(host, host, pkey, pkey, nonce, nonce).
5   event e1(host, host, pkey, pkey, nonce).
6
7   query y: host, pkx: pkey, pky: pkey, nx: nonce, ny: nonce;
8             inj-event(endB(A, y, pkx, pky, nx, ny)) ==>
9             ( inj-event(e3(A, y, pkx, pky, nx, ny)) ==>
10            ( inj-event(e2(A, y, pkx, pky, nx, ny)) ==>
11             inj-event(e1(A, y, pkx, pky, nx)))).
12
13  (* Role of the initiator with identity xA and secret key skxA *)
14  let processInitiator(pkS: spkey, skA: skey, skB: skey) =
15     (* The attacker starts the initiator by choosing identity xA,
16          and its interlocutor xB0.
17       We check that xA is honest (i.e. is A or B)
18          and get its corresponding key.
19     *)
20     in(c, (xA: host, hostX: host));
21     if xA = A || xA = B then
22     let skxA = if xA = A then skA else skB in
23     let pkxA = pk(skxA) in
24     (* Real start of the role *)
25     (* Message 1: Get the public key certificate for the other host *)
26     out(c, (xA, hostX));
27     (* Message 2 *)
28     in(c, ms: bitstring);
29     let (pkX: pkey, =hostX) = checksign(ms,pkS) in
30     (* Message 3 *)
31     new Na: nonce;
32     event e1(xA, hostX, pkxA, pkX, Na);
33     out(c, encrypt((Na, xA), pkX));
34     (* Message 6 *)
35     in(c, m: bitstring);
36     let (=Na, NX2: nonce, =hostX) = decrypt(m, skA) in
37     let m7 = encrypt(nonce_to_bitstring(NX2), pkX) in
38     event e3(xA, hostX, pkxA, pkX, Na, NX2);
39     (* Message 7 *)
40     out(c, m7).
41
42  (* Role of the responder with identity xB and secret key skxB *)
43  let processResponder(pkS: spkey, skA: skey, skB: skey) =
44     (* The attacker starts the responder by choosing identity xB.
45          We check that xB is honest (i.e. is A or B). *)
46     in(c, xB: host);
47     if xB = A || xB = B then
48     let skxB = if xB = A then skA else skB in
49     let pkxB = pk(skxB) in
50     (* Real start of the role *)
51     (* Message 3 *)
52     in(c, m: bitstring);
53     let (NY: nonce, hostY: host) = decrypt(m, skxB) in
54     (* Message 4: Get the public key certificate for the other host *)
55     out(c, (xB, hostY));
56     (* Message 5 *)
57     in(c, ms: bitstring);
58     let (pkY: pkey, =hostY) = checksign(ms,pkS) in
59     (* Message 6 *)
60     new Nb: nonce;
61     event e2(hostY, xB, pkY, pkxB, NY, Nb);
62     out(c, encrypt((NY, Nb, xB), pkY));
63     (* Message 7 *)
64     in(c, m3: bitstring);
65     if nonce_to_bitstring(Nb) = decrypt(m3, skB) then
66     event endB(hostY, xB, pkY, pkxB, NY, Nb).
67
68  (* Server *)
69  let processS(skS: sskey) =
70     in(c, (a: host, b: host));
71     get keys(=b, sb) in
72     out(c, sign((sb, b), skS)).
73
74  (* Key registration *)
75  let processK =
76     in(c, (h: host, k: pkey));
77     if h <> A && h <> B then insert keys(h,k).
78
79  (* Start process *)
80  process
81     new skA: skey; let pkA = pk(skA) in out(c, pkA); insert keys(A, pkA);
82     new skB: skey; let pkB = pk(skB) in out(c, pkB); insert keys(B, pkB);
83     new skS: sskey; let pkS = spk(skS) in out(c, pkS);
84     (
85         (* Launch an unbounded number of sessions of the initiator *)
86         (! processInitiator(pkS, skA, skB)) |
87         (* Launch an unbounded number of sessions of the responder *)
88         (! processResponder(pkS, skA, skB)) |
89         (* Launch an unbounded number of sessions of the server *)
90         (! processS(skS)) |
91         (* Key registration process *)
92         (! processK)
93     )
```

The event endB (Line 66) means that the responder has completed the protocol, e3 (Line 38) that the initiator received message 6 and sent message 7, e2 (Line 61) that the responder received message 3 and sent message 6, e1 (Line 32) that the initiator sent message 3. These events take as arguments all parameters of the protocol: the host names, their public keys, and the nonces, except e1 which cannot take Nb as argument since it has not been chosen yet when e1 is executed. We prove the correspondence

```
inj-event(endB(A, y, pkx, pky, nx, ny)) ==>
( inj-event(e3(A, y, pkx, pky, nx, ny)) ==>
( inj-event(e2(A, y, pkx, pky, nx, ny)) ==>
  inj-event(e1(A, y, pkx, pky, nx)))).
```
