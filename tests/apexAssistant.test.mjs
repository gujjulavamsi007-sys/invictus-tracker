import test from 'node:test';
import assert from 'node:assert/strict';
import { answerApexQuestion, getApexGenerativeContext, getApexNavigationIntent } from '../src/apexAssistant.mjs';

const makeTrip = (overrides = {}) => ({
  id: 1,
  date: '10-09-2026',
  startTime: new Date(2026, 8, 10, 9).getTime(),
  endTime: new Date(2026, 8, 10, 10).getTime(),
  visitor: 'Client A',
  fromLoc: 'Office',
  toLoc: 'Client site',
  totalKm: 12,
  ratePerKm: 5,
  petrolCharges: 60,
  parkingFees: 20,
  totalAmount: 80,
  ...overrides
});

const sampleTrips = [
  makeTrip({ id: 1, visitor: 'Client A', toLoc: 'North', totalKm: 12, petrolCharges: 60, parkingFees: 20, totalAmount: 80 }),
  makeTrip({
    id: 2,
    date: '12-09-2026',
    startTime: new Date(2026, 8, 12, 11).getTime(),
    visitor: 'Client A',
    toLoc: 'North',
    totalKm: 8,
    petrolCharges: 40,
    parkingFees: 0,
    totalAmount: 40
  }),
  makeTrip({
    id: 3,
    date: '02-08-2026',
    startTime: new Date(2026, 7, 2, 12).getTime(),
    visitor: 'Client B',
    toLoc: 'South',
    totalKm: 5,
    petrolCharges: 25,
    parkingFees: 5,
    totalAmount: 30
  })
];

test('answers expense questions using saved trip amounts and offers report navigation', () => {
  const answer = answerApexQuestion('How much have I spent?', sampleTrips);

  assert.match(answer.text, /3 trips · 25\.0 km/);
  assert.match(answer.text, /Petrol: ₹125/);
  assert.match(answer.text, /Parking: ₹25/);
  assert.match(answer.text, /Total expenses: ₹150/);
  assert.deepEqual(answer.actions.map(action => action.tab), ['reports', 'trips']);
});

test('filters trip analysis to the requested month', () => {
  const answer = answerApexQuestion('Summarize this month', sampleTrips, {
    now: new Date(2026, 8, 20)
  });

  assert.match(answer.text, /this month summary/);
  assert.match(answer.text, /2 trips · 20\.0 km/);
  assert.match(answer.text, /Total expenses: ₹120/);
});

test('returns petrol and parking totals independently', () => {
  const petrol = answerApexQuestion('How much petrol this month?', sampleTrips, {
    now: new Date(2026, 8, 20)
  });
  const parking = answerApexQuestion('How much did I spend on parking?', sampleTrips);

  assert.match(petrol.text, /Petrol expenses in this month: ₹100/);
  assert.match(parking.text, /Parking expenses in all saved trips: ₹25/);
});

test('finds the most visited client, requested client totals, and common route', () => {
  const topClient = answerApexQuestion('Which client have I visited most?', sampleTrips);
  const clientExpenses = answerApexQuestion('How much did I spend for Client B?', sampleTrips);
  const commonRoute = answerApexQuestion('Which destination is most common?', sampleTrips);

  assert.match(topClient.text, /Client A.*2 trips/);
  assert.match(clientExpenses.text, /1 trip · 5\.0 km/);
  assert.match(clientExpenses.text, /Total expenses: ₹30/);
  assert.match(commonRoute.text, /Office → North.*2 trips/);
});

test('describes the most recent trip from the saved route and date fields', () => {
  const answer = answerApexQuestion('Tell me about my most recent trip', sampleTrips);
  assert.match(answer.text, /12 Sept 2026/);
  assert.match(answer.text, /Office to North, 8\.0 km, costing ₹40/);
});

test('provides report and history navigation for explicit requests', () => {
  assert.equal(getApexNavigationIntent('Open my reports'), 'reports');
  assert.equal(getApexNavigationIntent('Show saved trip history'), 'trips');
  assert.equal(getApexNavigationIntent('How much did I spend?'), null);
  assert.deepEqual(answerApexQuestion('Open my reports', sampleTrips).actions, [
    { label: 'Open summary', tab: 'reports' }
  ]);
  assert.deepEqual(answerApexQuestion('Show my trips', sampleTrips).actions, [
    { label: 'Browse trips', tab: 'trips' }
  ]);
});

test('handles empty and unsupported questions without inventing trip information', () => {
  const empty = answerApexQuestion('How much distance did I travel?', []);
  const unsupported = answerApexQuestion('What is the weather?', sampleTrips);

  assert.match(empty.text, /no saved trip distances to add up yet/i);
  assert.equal(unsupported.requiresGenerativeAI, true);
  assert.match(unsupported.fallbackText, /Gemini Nano/i);
});

test('answers a PDF capability question directly even with no saved trips', () => {
  const answer = answerApexQuestion('Can you provide a PDF if there is data?', []);

  assert.match(answer.text, /^Yes\./);
  assert.match(answer.text, /once you have saved trips/i);
  assert.match(answer.text, /PDF from Reports/i);
  assert.deepEqual(answer.actions, [{ label: 'Open reports', tab: 'reports' }]);
  assert.equal(answer.requiresGenerativeAI, undefined);
});

test('answers other capability questions separately from missing trip data', () => {
  const answer = answerApexQuestion('What can you do?', []);

  assert.match(answer.text, /petrol and parking/i);
  assert.match(answer.text, /PDF reports/i);
  assert.doesNotMatch(answer.text, /no trips saved/i);
});

test('answers its name directly and sends unrelated questions to AI even when no trips are saved', () => {
  const identity = answerApexQuestion('waht is ur name', []);
  const general = answerApexQuestion('What is the weather?', []);

  assert.match(identity.text, /I’m APEX/);
  assert.equal(identity.requiresGenerativeAI, undefined);
  assert.equal(general.requiresGenerativeAI, true);
  assert.doesNotMatch(general.text, /no trips are saved/i);
});

test('carries the previous time period into a short follow-up question', () => {
  const answer = answerApexQuestion('What about parking?', sampleTrips, {
    now: new Date(2026, 8, 20),
    history: [{ role: 'user', text: 'Summarize this month' }]
  });

  assert.match(answer.text, /Parking expenses in this month: ₹20/);
});

test('answers highest-travel day from saved trips instead of returning a generic summary', () => {
  const answer = answerApexQuestion('Which day did I travel the most?', sampleTrips);

  assert.match(answer.text, /10 Sept 2026: 12\.0 km across 1 trip/);
});

test('compares month totals and explains recorded category changes', () => {
  const answer = answerApexQuestion('Compare this month with last month', sampleTrips, {
    now: new Date(2026, 8, 20)
  });

  assert.match(answer.text, /September 2026: ₹120 across 2 trips/);
  assert.match(answer.text, /August 2026: ₹30 across 1 trip/);
  assert.match(answer.text, /Your total is ₹90 more \(300%\)/);
  assert.match(answer.text, /Petrol increased by ₹75/);
});

test('routes unsupported questions to the on-device model with a distinct fallback', () => {
  const first = answerApexQuestion('How can I cut fuel use?', sampleTrips);
  const second = answerApexQuestion('Is this route efficient?', sampleTrips);

  assert.equal(first.requiresGenerativeAI, true);
  assert.equal(second.requiresGenerativeAI, true);
  assert.match(first.fallbackText, /How can I cut fuel use/);
  assert.match(second.fallbackText, /Is this route efficient/);
});

test('provides on-device AI with exact saved trip summaries and recent trip details', () => {
  const context = getApexGenerativeContext(sampleTrips);

  assert.match(context, /All saved trips: 3 trips, 25\.0 km/);
  assert.match(context, /petrol ₹125, parking ₹25, total ₹150/);
  assert.match(context, /Client A \(2 trips\)/);
  assert.match(context, /Office to North/);
  assert.match(context, /Newest 3 trip records \(of 3 total\)/);
});
