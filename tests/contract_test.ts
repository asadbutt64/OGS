import React from 'react';
import { assertSectionDataType, IllustrativeWarningBanner } from '../src/components/PrintableReport/contract_helpers';

console.log("============================================================");
console.log("RUNNING FRONTEND CONTRACT & WARNING BANNER TESTS");
console.log("============================================================");

// Test 1: assertSectionDataType throws on mismatched types
try {
  assertSectionDataType({ type: 'deconvolution_bar' }, 'correlation_scatter', 'Section 3');
  console.error("FAIL: assertSectionDataType did not throw on mismatched type!");
  process.exit(1);
} catch (e: any) {
  if (e.message.includes('Render-time contract violation')) {
    console.log("  [PASS] Test 1: assertSectionDataType threw correct error on mismatched type.");
  } else {
    console.error("  [FAIL] Test 1: assertSectionDataType threw wrong error:", e.message);
    process.exit(1);
  }
}

// Test 2: assertSectionDataType passes on correct types
try {
  assertSectionDataType({ type: 'correlation_scatter' }, 'correlation_scatter', 'Section 3');
  console.log("  [PASS] Test 2: assertSectionDataType passed silently on correct type.");
} catch (e: any) {
  console.error("  [FAIL] Test 2: assertSectionDataType threw error on correct type:", e.message);
  process.exit(1);
}

// Test 3: IllustrativeWarningBanner renders (returns React element) when type is illustrative_simulation
const bannerEl = IllustrativeWarningBanner({
  data: { type: 'illustrative_simulation' },
  defaultMessage: 'CRISPR warning'
});
if (bannerEl !== null) {
  console.log("  [PASS] Test 3: IllustrativeWarningBanner rendered successfully with illustrative_simulation type.");
} else {
  console.error("  [FAIL] Test 3: IllustrativeWarningBanner returned null for illustrative data!");
  process.exit(1);
}

// Test 4: IllustrativeWarningBanner does not render (returns null) when type is NOT illustrative_simulation
const normalEl = IllustrativeWarningBanner({
  data: { type: 'gtex_real_data' },
  defaultMessage: 'Normal data'
});
if (normalEl === null) {
  console.log("  [PASS] Test 4: IllustrativeWarningBanner correctly returned null for non-illustrative data.");
} else {
  console.error("  [FAIL] Test 4: IllustrativeWarningBanner rendered for non-illustrative data!");
  process.exit(1);
}

// Test 5: IllustrativeWarningBanner renders when nested in data payload
const nestedEl = IllustrativeWarningBanner({
  data: { type: 'deconvolution_bar', data: { type: 'illustrative_simulation' } },
  defaultMessage: 'Deconvolution warning'
});
if (nestedEl !== null) {
  console.log("  [PASS] Test 5: IllustrativeWarningBanner rendered successfully with nested illustrative data.");
} else {
  console.error("  [FAIL] Test 5: IllustrativeWarningBanner returned null for nested illustrative data!");
  process.exit(1);
}

console.log("============================================================");
console.log("ALL FRONTEND CONTRACT TESTS PASSED [OK]");
console.log("============================================================");
process.exit(0);
