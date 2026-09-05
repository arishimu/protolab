# Chapter 1: Introduction

This manual describes the ProVerif software package version 2.05. ProVerif is a tool for automatically analyzing the security of cryptographic protocols. Support is provided for, but not limited to, cryptographic primitives including: symmetric and asymmetric encryption; digital signatures; hash functions; bit-commitment; and non-interactive zero-knowledge proofs. ProVerif is capable of proving reachability properties, correspondence assertions, and observational equivalence. These capabilities are particularly useful to the computer security domain since they permit the analysis of secrecy and authentication properties. Moreover, emerging properties such as privacy, traceability, and verifiability can also be considered. Protocol analysis is considered with respect to an unbounded number of sessions and an unbounded message space. Moreover, the tool is capable of attack reconstruction: when a property cannot be proved, ProVerif tries to reconstruct an execution trace that falsifies the desired property.

## 1.1 Applications of ProVerif

The applicability of ProVerif has been widely demonstrated. Protocols from the literature have been successfully analyzed: flawed and corrected versions of Needham-Schroeder public-key [NS78, Low96] and shared key [NS78, BAN89, NS87]; Woo-Lam public-key [WL92, WL97] and shared-key [WL92, AN95, AN96, WL97, GJ03]; Denning-Sacco [DS81, AN96]; Yahalom [BAN89]; Otway-Rees [OR87, AN96, Pau98]; and Skeme [Kra96]. The resistance to password guessing attacks has been demonstrated for the password-based protocols EKE [BM92] and Augmented EKE [BM93].

ProVerif has also been used in more substantial case studies:

- Abadi & Blanchet [AB05b] use correspondence assertions to verify the certified email protocol [AGHP02].
- Abadi, Blanchet & Fournet [ABF07] analyze the JFK (Just Fast Keying) [ABB+04] protocol, which was one of the candidates to replace IKE as the key exchange protocol in IPSec, by combining manual proofs with ProVerif proofs of correspondences and equivalences.
- Blanchet & Chaudhuri [BC08] study the integrity of the Plutus file system [KRS+03] on untrusted storage, using correspondence assertions, resulting in the discovery, and subsequent fixing, of weaknesses in the initial system.
- Bhargavan et al. [BFGT06, BFG06, BFGS08] use ProVerif to analyze cryptographic protocol implementations written in F#; in particular, the Transport Layer Security (TLS) protocol has been studied in this manner [BCFZ08].
- Chen & Ryan [CR09] evaluate authentication protocols found in the Trusted Platform Module (TPM), a widely deployed hardware chip, and discovered vulnerabilities.
- Delaune, Kremer & Ryan [DKR09, KR05] and Backes, Hritcu & Maffei [BHM08] formalize and analyze privacy properties for electronic voting using observational equivalence.
- Delaune, Ryan & Smyth [DRS08] and Backes, Maffei & Unruh [BMU08] analyze the anonymity properties of the trusted computing scheme Direct Anonymous Attestation (DAA) [BCC04, SRC07] using observational equivalence.
- Küsters & Truderung [KT09, KT08] examine protocols with Diffie-Hellman exponentiation and XOR.
- Smyth, Ryan, Kremer & Kourjieh [SRKK10, SRK10] formalize and analyze verifiability properties for electronic voting using reachability.
- Bhargavan, Blanchet and Kobeissi verify Signal [KBB17] and TLS 1.3 [BBK17].
- Blanchet verifies the ARINC 823 avionic protocols [Bla17].

For further examples, please refer to: http://proverif.inria.fr/proverif-users.html.

## 1.2 Scope of this manual

This manual provides an introductory description of the ProVerif software package version 2.05. The remainder of this chapter covers software support (Section 1.3) and installation (Section 1.4). Chapter 2 provides an introduction to ProVerif aimed at new users, advanced users may skip this chapter without loss of continuity. Chapter 3 demonstrates the basic use of ProVerif. Chapter 4 provides a more complete coverage of the features of ProVerif. Chapter 5 demonstrates the applicability of ProVerif with a case study. Chapter 6 considers advanced topics and Chapter 7 concludes. For reference, the complete grammar of ProVerif is presented in Appendix A. This manual does not attempt to describe the theoretical foundations of the internal algorithms used by ProVerif since these are available elsewhere (see Chapter 7 for references); nor is the applied pi calculus [AF01, RS11, ABF17], which provides the basis for ProVerif, discussed.

## 1.3 Support

Software bugs and comments should be reported by e-mail to:

```
proverif-dev@inria.fr
```

User support, general discussion and new release announcements are provided by the ProVerif mailing list. To subscribe to the list, send an email to sympa@inria.fr with the subject "subscribe proverif" (without quotes). To post on the list, send an email to:

```
proverif@inria.fr
```

Non-members are not permitted to send messages to the mailing list.

## 1.4 Installation

ProVerif is compatible with the Linux, Mac, and Windows operating systems; it can be downloaded from:

```
http://proverif.inria.fr/
```

The remainder of this section covers installation on Linux, Mac, and Windows platforms.

### 1.4.1 Installation via OPAM

ProVerif has been developed using Objective Caml (OCaml) and OPAM is the package manager of OCaml. Installing via OPAM is the simplest, especially if you already have OPAM installed.

1. If you do not already have OPAM installed, download it from https://opam.ocaml.org/ and install it.
2. If you already have OPAM installed, run

   ```
   opam update
   ```

   to make sure that you get the latest version of ProVerif.
3. Run

   ```
   opam depext conf-graphviz
   opam depext proverif
   opam install proverif
   ```

   The first line installs graphviz, if you do not already have it. You may also install it using the package manager of your Linux, OSX, or cygwin distribution, especially if opam fails to install it. It is needed only for the graphical display of attacks.

   The second line installs GTK+2 including development libraries, if you do not already have it. You may also install it using the package manager of your distribution. You may additionally need to install pkgconfig using the package manager of your distribution, if you do not already have it and it is not installed by opam depext proverif. (This happens in particular on some OSX installations.) GTK+2 is needed for the interactive simulator proverif interact.

   The third line installs ProVerif itself and its OCaml dependencies. ProVerif executables are in ~/.opam/⟨switch⟩/bin, which is in the PATH, examples are in ~/.opam/⟨switch⟩/doc/proverif, and various helper files are in ~/.opam/⟨switch⟩/share/proverif. The directory ⟨switch⟩ is the opam switch in which you installed ProVerif, by default system.
4. Download the documentation package proverifdoc2.05.tar.gz from http://proverif.inria.fr/ and uncompress it (e.g. using tar -xzf proverifdoc2.05.tar.gz or using your favorite file archive tool). That gives you the manual and a few additional examples.

### 1.4.2 Installation from sources (Linux/Mac/cygwin)

1. On Mac OS X, you need to install XCode if you do not already have it. It can be downloaded from https://developer.apple.com/xcode/.
2. ProVerif has been developed using Objective Caml (OCaml), accordingly OCaml version 4.03 or higher is a prerequisite to installation and can be downloaded from http://ocaml.org/, or installed via the package manager of your distribution. OCaml provides a byte-code compiler (ocamlc) and a native-code compiler (ocamlopt). Although ProVerif does not strictly require the native-code compiler, it is highly recommended to achieve large performance gains.
3. The installation of graphviz is required if you want to have a graphical representation of the attacks that ProVerif might find. Graphviz can be downloaded from http://graphviz.org or installed via the package manager of your distribution.
4. The installation GTK+2.24 and LablGTK2 is required if you want to run the interactive simulator proverif interact. Use the package manager of your distribution to install GTK+2 including its development libraries if you do not already have it and download lablgtk-2.18.6.tar.gz from http://lablgtk.forge.ocamlcore.org/ and follow the installation instructions in their README file.
5. Download the source package proverif2.05.tar.gz and the documentation package proverifdoc2.05.tar.gz from http://proverif.inria.fr/.
6. Decompress the archives:

   (a) using GNU tar:

   ```
   tar -xzf proverif2.05.tar.gz
   tar -xzf proverifdoc2.05.tar.gz
   ```

   (b) using tar:

   ```
   gunzip proverif2.05.tar.gz
   tar -xf proverif2.05.tar
   gunzip proverifdoc2.05.tar.gz
   tar -xf proverifdoc2.05.tar
   ```

   This will create a directory proverif2.05 in the current directory.
7. You are now ready to build ProVerif:

   ```
   cd proverif2.05
   ./build
   ```

   (If you did not install LablGTK2, the compilation of proverif interact fails, but the executables proverif and proveriftotex are still produced correctly, so you can use ProVerif normally, but cannot run the interactive simulator.)
8. ProVerif has now been successfully installed.

### 1.4.3 Installation from binaries (Windows)

Windows users may install ProVerif using the binary distribution, as described below. They may also install cygwin and install ProVerif from sources as explained in the previous section.

1. The installation of graphviz is required if you want to have a graphical representation of the attacks that ProVerif might find. Graphviz can be downloaded from https://graphviz.gitlab.io/_pages/Download/Download_windows.html. Make sure that the bin subdirectory of the Graphviz installation directory is in your PATH.
2. The installation GTK+2.24 is required if you want to run the interactive simulator proverif interact. At https://download.gnome.org/binaries/win32/gtk%2B/2.24/ download gtk+-bundle_2.24.10-20120208_win32.zip, unzip it in the directory C:\GTK, and add C:\GTK\bin to your PATH.
3. Download the Windows binary package proverifbin2.05.tar.gz and the documentation package proverifdoc2.05.tar.gz from http://proverif.inria.fr/.
4. Decompress the proverifbin2.05.tar.gz and proverifdoc2.05.tar.gz archives in the same directory using your favorite file archive tool (e.g. WinZip).
5. ProVerif has now been successfully installed in the directory where the file was extracted.

### 1.4.4 Emacs

If you use the emacs text editor for editing ProVerif input files, you can install the emacs mode provided with the ProVerif distribution.

1. Copy the file emacs/proverif.el (if you installed by OPAM in the switch ⟨switch⟩, the file ~/.opam/⟨switch⟩/share/proverif/emacs/proverif.el) to a directory where Emacs will find it (that is, in your emacs load-path).
2. Add the following lines to your .emacs file:

   ```
   (setq auto-mode-alist
        (cons '("\\.horn$" . proverif-horn-mode)
        (cons '("\\.horntype$" . proverif-horntype-mode)
        (cons '("\\.pv[l]?$" . proverif-pv-mode)
        (cons '("\\.pi$" . proverif-pi-mode) auto-mode-alist)))))
   (autoload 'proverif-pv-mode "proverif" "Major mode for editing ProVerif code." t)
   (autoload 'proverif-pi-mode "proverif" "Major mode for editing ProVerif code." t)
   (autoload 'proverif-horn-mode "proverif" "Major mode for editing ProVerif code." t)
   (autoload 'proverif-horntype-mode "proverif" "Major mode for editing ProVerif code." t)
   ```

### 1.4.5 Atom

There is also a ProVerif mode for the text editor Atom (https://atom.io/), by Vincent Cheval. It can be downloaded from the Atom web site; the package name is language-proverif.

## 1.5 Copyright

The ProVerif software is distributed under the GNU general public license. For details see:

```
http://proverif.inria.fr/LICENSE
```
