# Chapter 7: Outlook

The ProVerif software tool is the result of more than a decade of theoretical research. This manual explained how to use ProVerif in practice. More information on the theory behind ProVerif can be found in research papers:

- For a general survey, please see [Bla16].
- For the verification of secrecy as reachability, we recommend [Bla11, AB05a].
- For the verification of correspondences, we recommend [Bla09].
- For the verification of strong secrecy, see [Bla04]; for observational equivalence, guessing attacks, and the treatment of equations, see [BAF08]. See [BS18] for the extension to synchronization.
- For the reconstruction of attacks, see [AB05c].
- For the termination result on tagged protocols, see [BP05].
- Case studies can be found in [AB05b, ABF07, BC08, KBB17, BBK17, Bla17].

ProVerif is a powerful tool for verifying protocols in the formal model. It works for an unbounded number of sessions and an unbounded message space. It supports many cryptographic primitives defined by rewrite rules or equations. It can prove various security properties: reachability, correspondences, and observational equivalences. These properties are particularly interesting to the security domain because they allow analysis of secrecy, authentication, and privacy properties. It can also reconstruct attacks when the desired properties do not hold.

However, ProVerif performs abstractions, so there are situations in which the property holds and cannot be proved by ProVerif. Moreover, proofs of security properties in ProVerif abstract away from details of the cryptography, and therefore may not in general be sound with respect to the computational model of cryptography. The CryptoVerif tool (http://cryptoverif.inria.fr), an automatic prover for security properties in the computational security model, aims to address this problem.
