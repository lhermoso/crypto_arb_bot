# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Remove unused `_isBuy` parameter from `calculateWeightedAveragePrice` function in `src/utils/calculations.ts`

### Security
- Fixed high severity vulnerability in glob 10.2.0-10.4.5 (command injection via `-c/--cmd`)
- Fixed moderate severity vulnerability in js-yaml (prototype pollution in merge)
