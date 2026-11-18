# Aeolus squadrons

`@aeolus-fleet/squadrons` forms teams of ships of an [Aeolus](https://github.com/ThomasHendrickx/aeolus-fleet) fleet from template and blueprint files in git and leads them: roles, hand-offs, each member's health. It is optional: a ship of each fleet it serves, beside core, reaching the fleet only through its public API. How to run it and its API: [packages/squadrons/README.md](packages/squadrons/README.md); its files in git and the check-in: [docs/squadrons.md](docs/squadrons.md). For the product, see [aeolus-fleet](https://github.com/ThomasHendrickx/aeolus-fleet).

## Release

Dispatch Candidate for the release version on the release commit. It builds and uploads a tarball with its integrity record. Walk that candidate on staging and record a successful `staging-walk` commit status with the description `<version>: passed, candidate run <id>`.

Dispatch Release on the same commit with the version and candidate run ID. Release requires a matching passed walk, verifies the successful Candidate run, commit, version and downloaded tarball's SHA-512 integrity, then publishes that exact tarball. It refuses a release without a matching walked candidate.
