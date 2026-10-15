#!/usr/bin/env bash
set -euo pipefail
# Runs the Node built-in test runner. Coverage gating arrives with issue #3.
npm test
