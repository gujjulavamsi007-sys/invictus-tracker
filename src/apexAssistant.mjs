import {
  compareTripsByReportOrder,
  getTripDate,
  getTripPetrolAmount,
  getTripTotalAmount
} from './reportLogic.mjs';

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

export const APEX_STARTER_PROMPTS = [
  'How much have I spent?',
  'Summarize this month',
  'Which client have I visited most?',
  'Open my reports'
];

export function getApexNavigationIntent(question) {
  const text = String(question || '').toLocaleLowerCase();
  if (/\b(open|show|view|go to|take me to|navigate to|browse|list)\b/.test(text)) {
    if (/\b(report|reports|summary|summaries|analytics|expenses?|expense dashboard)\b/.test(text)) return 'reports';
    if (/\b(trip|trips|history|trip history)\b/.test(text)) return 'trips';
  }
  return null;
}

function getDateBounds(question, now) {
  const text = String(question || '').toLocaleLowerCase();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (/\b(today|this day)\b/.test(text)) {
    return { from: today, to: today, label: 'today' };
  }
  if (/\byesterday\b/.test(text)) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { from: yesterday, to: yesterday, label: 'yesterday' };
  }
  if (/\b(last week|previous week)\b/.test(text)) {
    const monday = new Date(today);
    monday.setDate(monday.getDate() - ((today.getDay() + 6) % 7) - 7);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return { from: monday, to: sunday, label: 'last week' };
  }
  if (/\b(this week|this week to date|past 7 days|last 7 days)\b/.test(text)) {
    const monday = new Date(today);
    monday.setDate(monday.getDate() - ((today.getDay() + 6) % 7));
    return { from: monday, to: today, label: 'this week' };
  }
  if (/\b(this month|month to date|current month)\b/.test(text)) {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      label: 'this month'
    };
  }
  if (/\b(last month|previous month)\b/.test(text)) {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 0),
      label: 'last month'
    };
  }

  for (let index = 0; index < MONTHS.length; index += 1) {
    const monthName = MONTHS[index];
    if (!new RegExp('\\b' + monthName + '\\b').test(text)) continue;
    const yearMatch = text.match(new RegExp('\\b(20\\d{2})\\b'));
    const year = yearMatch ? Number(yearMatch[1]) : now.getFullYear();
    return {
      from: new Date(year, index, 1),
      to: new Date(year, index + 1, 0),
      label: new Date(year, index, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    };
  }
  return null;
}

function filterByDate(trips, bounds) {
  if (!bounds) return trips;
  const fromKey = dateKey(bounds.from);
  const toKey = dateKey(bounds.to);
  return trips.filter(trip => {
    const date = getTripDate(trip);
    if (!date) return false;
    const key = dateKey(date);
    return key >= fromKey && key <= toKey;
  });
}

function dateKey(date) {
  return String(date.getFullYear()).padStart(4, '0') + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

function formatAmount(amount) {
  return '₹' + Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function summarizeTrips(trips) {
  return trips.reduce((summary, trip) => ({
    count: summary.count + 1,
    km: summary.km + (Number(trip.totalKm) || 0),
    petrol: summary.petrol + getTripPetrolAmount(trip),
    parking: summary.parking + (Number(trip.parkingFees) || 0),
    total: summary.total + getTripTotalAmount(trip)
  }), { count: 0, km: 0, petrol: 0, parking: 0, total: 0 });
}

export function getApexGenerativeContext(trips = []) {
  const allTrips = Array.isArray(trips) ? trips : [];
  if (!allTrips.length) return 'There are no saved trips.';
  const summary = summarizeTrips(allTrips);
  const mostVisited = getTopVisitor(allTrips);
  const recentTrips = [...allTrips]
    .sort((a, b) => compareTripsByReportOrder(b, a))
    .slice(0, 12);
  const records = recentTrips.map(trip => {
    const route = `${trip.fromLoc || 'Unknown start'} to ${trip.toLoc || 'Unknown destination'}`;
    const purpose = String(trip.purpose || '').trim();
    return `- ${formatTripDate(trip)}; ${trip.visitor || 'No client'}; ${route}; ${Number(trip.totalKm) || 0} km; petrol ${formatAmount(getTripPetrolAmount(trip))}; parking ${formatAmount(Number(trip.parkingFees) || 0)}; total ${formatAmount(getTripTotalAmount(trip))}${purpose ? `; purpose ${purpose}` : ''}`;
  });
  const visitorLine = mostVisited ? `Most visited client: ${mostVisited[0]} (${mostVisited[1]} trips).\n` : '';
  return `All saved trips: ${summary.count} trips, ${summary.km.toFixed(1)} km, petrol ${formatAmount(summary.petrol)}, parking ${formatAmount(summary.parking)}, total ${formatAmount(summary.total)}.\n` +
    visitorLine + `Newest ${recentTrips.length} trip records (of ${allTrips.length} total):\n${records.join('\n')}\n` +
    'Use these records for route, date, client, purpose, and expense context. The list may be a recent subset; do not claim it covers older records.';
}

function monthBounds(now, offset) {
  return {
    from: new Date(now.getFullYear(), now.getMonth() + offset, 1),
    to: new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  };
}

function formatMonth(bounds) {
  return bounds.from.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function getTopVisitor(trips) {
  const visitors = new Map();
  for (const trip of trips) {
    const name = String(trip.visitor || '').trim();
    if (!name) continue;
    visitors.set(name, (visitors.get(name) || 0) + 1);
  }
  return [...visitors.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
}

function findRequestedVisitor(question, trips) {
  const text = String(question || '').toLocaleLowerCase();
  const visitorNames = [...new Set(trips.map(trip => String(trip.visitor || '').trim()).filter(name => name.length >= 3))]
    .sort((a, b) => b.length - a.length);
  return visitorNames.find(name => text.includes(name.toLocaleLowerCase())) || null;
}

function formatTripDate(trip) {
  const date = getTripDate(trip);
  return date ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : (trip.date || 'Date not recorded');
}

function isFollowUpQuestion(question) {
  const text = String(question || '').toLocaleLowerCase();
  return /^(and\b|what about\b|how about\b|also\b|same for\b|then\b)/.test(text) ||
    /\b(what about|how about)\b/.test(text);
}

function requestGenerativeReply(question) {
  const questionPreview = String(question || '').slice(0, 180);
  return {
    text: 'Let me answer that using the current conversation and the saved-trip summary.',
    requiresGenerativeAI: true,
    fallbackText: `I heard your question: “${questionPreview}”. APEX’s open-ended AI needs Gemini Nano on a supported Android phone; this chat cannot generate that reply without it. I can still calculate trip totals, distance, petrol, parking, frequent clients and routes, and answer questions about reports.`,
    actions: [{ label: 'Open reports', tab: 'reports' }, { label: 'Browse trips', tab: 'trips' }]
  };
}

function isSavedTripDataQuestion(question) {
  const text = String(question || '').toLocaleLowerCase();
  const mentionsSavedData = /\b(trip|trips|expense|expenses|petrol|fuel|parking|distance|kilomet|km|client|visitor|route|destination|travel|travelled|traveled|spend|spent|cost|amount|report|summary|breakdown)\b/.test(text);
  const asksForSavedValue = /\b(how much|how many|how far|which|what about|show|list|summar|analy|report|compare|versus|\bvs\b|increase|decrease|higher|lower|recent|latest|most|top|average|count|longest|highest|today|yesterday|this week|last week|this month|last month)\b/.test(text);
  const asksForAdviceOrGeneralHelp = /\b(how can|how do i|should i|recommend|suggest|efficient|why is|why did|explain|improve|reduce|cut|save|name|who are you)\b/.test(text);
  const isExactCalculation = /\b(how much|how many|how far|compare|versus|\bvs\b|increase|decrease|higher|lower|spent|spend|total|cost|amount)\b/.test(text);
  return mentionsSavedData && asksForSavedValue && (!asksForAdviceOrGeneralHelp || isExactCalculation);
}

export function answerApexQuestion(question, trips = [], options = {}) {
  const rawText = String(question || '').trim();
  const text = rawText.toLocaleLowerCase();
  const allTrips = Array.isArray(trips) ? trips : [];
  const navigation = getApexNavigationIntent(text);
  if (navigation === 'reports') {
    return {
      text: 'Your saved-trip summary is ready.',
      actions: [{ label: 'Open summary', tab: 'reports' }]
    };
  }
  if (navigation === 'trips') {
    return {
      text: 'Opening your saved trip history.',
      actions: [{ label: 'Browse trips', tab: 'trips' }]
    };
  }

  if (/\b(pdf|portable document|download|export)\b/i.test(text)) {
    const hasTrips = allTrips.length > 0;
    return {
      text: hasTrips
        ? 'Yes. You can export your saved trips as a PDF from Reports. I can also analyse the trip data before you export it.'
        : 'Yes. Once you have saved trips, you can export them as a PDF from Reports. I can analyse the saved trip data too. There are no trips saved on this device yet, so the report will have no trip entries for now.',
      actions: [{ label: 'Open reports', tab: 'reports' }]
    };
  }

  if (/\b(what can you do|what do you do|how can you help|help me|capabilities)\b/i.test(text)) {
    return {
      text: 'I can total your saved trip distance and expenses, break out petrol and parking, find your most visited client or route, compare time periods, and help you open trip history or PDF reports. I only use trip data saved in this app.',
      actions: [{ label: 'Open reports', tab: 'reports' }, { label: 'Browse trips', tab: 'trips' }]
    };
  }

  if (/\b(?:what|waht)\s+(?:is|s)\s+(?:your|ur)\s+name\b|\bwho\s+are\s+you\b|\bwhat should i call you\b/i.test(text)) {
    return {
      text: 'I’m APEX, your personal trip and expense assistant. You can call me APEX.',
      actions: []
    };
  }

  if (/^(hi|hello|hey|good morning|good afternoon|good evening)[!.\s]*$/i.test(text)) {
    return {
      text: allTrips.length
        ? 'Hi! I’m APEX. I can help you understand your saved trips and expenses. What would you like to know?'
        : 'Hi! I’m APEX. I can help with trip and expense questions. Save a trip to get personalised totals, or ask me what I can do.',
      actions: allTrips.length ? [{ label: 'Open reports', tab: 'reports' }] : []
    };
  }

  const now = options.now instanceof Date ? options.now : new Date();
  const history = Array.isArray(options.history) ? options.history : [];
  const inheritedBounds = [...history].reverse()
    .filter(message => message && message.role === 'user')
    .map(message => getDateBounds(message.text, now))
    .find(Boolean);
  const bounds = getDateBounds(text, now) || (isFollowUpQuestion(text) ? inheritedBounds : null);
  let selectedTrips = filterByDate(allTrips, bounds);
  let scopeLabel = bounds ? bounds.label : 'all saved trips';
  const requestedVisitor = findRequestedVisitor(text, allTrips);
  if (requestedVisitor) {
    selectedTrips = selectedTrips.filter(trip =>
      String(trip.visitor || '').trim().toLocaleLowerCase() === requestedVisitor.toLocaleLowerCase()
    );
    scopeLabel += ' for ' + requestedVisitor;
  }

  if (!isSavedTripDataQuestion(text) && allTrips.length === 0) {
    return requestGenerativeReply(rawText);
  }

  if (allTrips.length === 0) {
    const asksForParking = /\bparking\b/i.test(text);
    const asksForPetrol = /\b(petrol|fuel)\b/i.test(text);
    const asksForDistance = /\b(distance|kilomet|kilometer|kilometre|km)\b/i.test(text);
    const asksForCount = /\b(trip|trips|how many|count)\b/i.test(text);
    let detail = 'I can’t calculate that yet because no trips are saved on this device.';
    if (asksForParking) detail = 'There are no saved trips with parking costs to total yet.';
    else if (asksForPetrol) detail = 'There are no saved trips with petrol costs to total yet.';
    else if (asksForDistance) detail = 'There are no saved trip distances to add up yet.';
    else if (asksForCount) detail = 'There are no saved trips to count yet.';
    return {
      text: detail + ' Record a trip and ask me again; I’ll use the saved details.',
      actions: [{ label: 'Open reports', tab: 'reports' }]
    };
  }

  const comparisonWasRequested = /\b(compare|compared|versus|\bvs\b|increase|increased|decrease|decreased|higher|lower|more than|less than|why did.*(change|increase|decrease))\b/i.test(text) ||
    history.some(message => message?.role === 'user' && /\b(compare|compared|versus|\bvs\b|this month.*last month|last month.*this month)\b/i.test(message.text || ''));
  const comparisonMentionsMonths = /\b(month|monthly|this month|last month|previous month)\b/i.test(text) ||
    history.some(message => message?.role === 'user' && /\b(this month|last month|previous month)\b/i.test(message.text || ''));
  if (comparisonWasRequested && comparisonMentionsMonths) {
    const currentBounds = monthBounds(now, 0);
    const previousBounds = monthBounds(now, -1);
    const current = summarizeTrips(filterByDate(allTrips, currentBounds));
    const previous = summarizeTrips(filterByDate(allTrips, previousBounds));
    const change = current.total - previous.total;
    const percent = previous.total ? Math.round((Math.abs(change) / previous.total) * 100) : null;
    const changeText = change === 0
      ? 'Your recorded total is unchanged.'
      : `Your total is ${formatAmount(Math.abs(change))} ${change > 0 ? 'more' : 'less'}${percent === null ? '' : ` (${percent}%)`}.`;
    const categoryChange = (name, currentValue, previousValue, suffix = '') => {
      const difference = currentValue - previousValue;
      if (!difference) return `${name} was unchanged`;
      return `${name} ${difference > 0 ? 'increased' : 'decreased'} by ${formatAmount(Math.abs(difference))}${suffix}`;
    };
    return {
      text: `${formatMonth(currentBounds)}: ${formatAmount(current.total)} across ${current.count} ${current.count === 1 ? 'trip' : 'trips'}.\n` +
        `${formatMonth(previousBounds)}: ${formatAmount(previous.total)} across ${previous.count} ${previous.count === 1 ? 'trip' : 'trips'}.\n` +
        `${changeText}\n${categoryChange('Petrol', current.petrol, previous.petrol)}; ${categoryChange('parking', current.parking, previous.parking)}; distance ${current.km >= previous.km ? 'increased' : 'decreased'} by ${Math.abs(current.km - previous.km).toFixed(1)} km. These are the changes recorded in your trips; they don’t establish why costs changed.`,
      actions: [{ label: 'Open reports', tab: 'reports' }]
    };
  }

  const wantsRecent = /\b(recent|latest|last trip|most recent)\b/.test(text);
  if (wantsRecent) {
    const recentTrip = [...selectedTrips].sort((a, b) => compareTripsByReportOrder(b, a))[0];
    if (!recentTrip) return { text: 'I could not find a trip in ' + scopeLabel + '.' };
    return {
      text: 'Your most recent trip in ' + scopeLabel + ' was on ' + formatTripDate(recentTrip) + ': ' +
        (recentTrip.fromLoc || 'Unknown start') + ' to ' + (recentTrip.toLoc || 'Unknown destination') +
        ', ' + (Number(recentTrip.totalKm) || 0).toFixed(1) + ' km, costing ' + formatAmount(getTripTotalAmount(recentTrip)) + '.',
      actions: [{ label: 'Browse trips', tab: 'trips' }]
    };
  }

  if (selectedTrips.length === 0 && !/\b(compare|compared|versus|\bvs\b|increase|increased|decrease|decreased|higher|lower|more than|less than|why did.*(change|increase|decrease))\b/i.test(text)) {
    return { text: 'I could not find any saved trips in ' + scopeLabel + '.' };
  }

  const summary = summarizeTrips(selectedTrips);
  const topVisitor = getTopVisitor(selectedTrips);
  const asksForVisitor = /\b(client|visitor|customer)\b/.test(text) &&
    /\b(most|top|frequent|often|many|visited|visit|who)\b/.test(text);
  if (asksForVisitor) {
    if (!topVisitor) return { text: 'There are no client or visitor names saved in ' + scopeLabel + '.' };
    return {
      text: topVisitor[0] + ' is your most visited client in ' + scopeLabel + ', with ' +
        topVisitor[1] + ' ' + (topVisitor[1] === 1 ? 'trip' : 'trips') + '.',
      actions: [{ label: 'Browse trips', tab: 'trips' }]
    };
  }

  const asksForMostTravelDay = /\b(day|date)\b/.test(text) &&
    /\b(most|highest|maximum|max|farthest|furthest|greatest)\b/.test(text) &&
    /\b(travel|travelled|traveled|distance|kilomet|km|far)\b/.test(text);
  if (asksForMostTravelDay) {
    const byDay = new Map();
    for (const trip of selectedTrips) {
      const date = getTripDate(trip);
      if (!date) continue;
      const key = dateKey(date);
      const day = byDay.get(key) || { date, km: 0, count: 0 };
      day.km += Number(trip.totalKm) || 0;
      day.count += 1;
      byDay.set(key, day);
    }
    const busiestDay = [...byDay.values()].sort((a, b) => b.km - a.km || a.date - b.date)[0];
    if (!busiestDay) return { text: 'I could not find dated trips in ' + scopeLabel + '.' };
    return {
      text: `Your highest-travel day in ${scopeLabel} was ${busiestDay.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}: ${busiestDay.km.toFixed(1)} km across ${busiestDay.count} ${busiestDay.count === 1 ? 'trip' : 'trips'}.`,
      actions: [{ label: 'Browse trips', tab: 'trips' }]
    };
  }

  if (/\b(longest|farthest|furthest)\b/.test(text) && /\b(trip|journey|distance|kilomet|km)\b/.test(text)) {
    const longestTrip = [...selectedTrips].sort((a, b) => (Number(b.totalKm) || 0) - (Number(a.totalKm) || 0))[0];
    return {
      text: `Your longest trip in ${scopeLabel} was ${formatTripDate(longestTrip)}: ${longestTrip.fromLoc || 'Unknown start'} to ${longestTrip.toLoc || 'Unknown destination'}, ${(Number(longestTrip.totalKm) || 0).toFixed(1)} km.`,
      actions: [{ label: 'Browse trips', tab: 'trips' }]
    };
  }

  const asksForDistance = /\b(distance|kilomet|kilometer|kilometre|km)\b/.test(text);
  const asksForCount = /\b(how many|number of|count|trip count)\b/.test(text);
  if (asksForDistance && !/\b(expense|spent|cost|amount|money|petrol|parking)\b/.test(text)) {
    return { text: 'You travelled ' + summary.km.toFixed(1) + ' km across ' + summary.count +
      ' ' + (summary.count === 1 ? 'trip' : 'trips') + ' in ' + scopeLabel + '.',
      actions: [{ label: 'Browse trips', tab: 'trips' }]
    };
  }
  if (asksForCount) {
    return { text: 'You have ' + summary.count + ' saved ' + (summary.count === 1 ? 'trip' : 'trips') +
      ' in ' + scopeLabel + ', covering ' + summary.km.toFixed(1) + ' km.',
      actions: [{ label: 'Browse trips', tab: 'trips' }]
    };
  }

  const asksForParkingOnly = /\b(parking)\b/.test(text) &&
    !/\b(petrol|fuel|breakdown|split)\b/.test(text) &&
    (/\b(how much|spent|spend|cost|expense|total|amount|paid)\b/.test(text) || isFollowUpQuestion(text));
  const asksForPetrolOnly = /\b(petrol|fuel)\b/.test(text) &&
    !/\b(parking|breakdown|split)\b/.test(text) &&
    (/\b(how much|spent|spend|cost|expense|total|amount|paid)\b/.test(text) || isFollowUpQuestion(text));
  if (asksForParkingOnly) {
    return { text: 'Parking expenses in ' + scopeLabel + ': ' + formatAmount(summary.parking) +
      ' across ' + summary.count + ' ' + (summary.count === 1 ? 'trip' : 'trips') + '.',
      actions: [{ label: 'Open summary', tab: 'reports' }]
    };
  }
  if (asksForPetrolOnly) {
    return { text: 'Petrol expenses in ' + scopeLabel + ': ' + formatAmount(summary.petrol) +
      ' across ' + summary.count + ' ' + (summary.count === 1 ? 'trip' : 'trips') + '.',
      actions: [{ label: 'Open summary', tab: 'reports' }]
    };
  }

  if (/\b(breakdown|split|break down)\b/.test(text)) {
    return { text: 'Expense breakdown for ' + scopeLabel + ' (' + summary.count + ' ' +
      (summary.count === 1 ? 'trip' : 'trips') + '):\nPetrol: ' + formatAmount(summary.petrol) +
      '\nParking: ' + formatAmount(summary.parking) + '\nCombined total: ' + formatAmount(summary.total) + '.',
      actions: [{ label: 'Open summary', tab: 'reports' }]
    };
  }

  if (/\b(average|per trip)\b/.test(text)) {
    return { text: 'Average expenses in ' + scopeLabel + ': ' +
      formatAmount(summary.total / summary.count) + ' per trip across ' + summary.count +
      ' ' + (summary.count === 1 ? 'trip' : 'trips') + '.',
      actions: [{ label: 'Open summary', tab: 'reports' }]
    };
  }

  if (/\b(route|destination|where)\b/.test(text) && /\b(top|most|frequent|often|common|usual)\b/.test(text)) {
    const routes = new Map();
    for (const trip of selectedTrips) {
      const route = (String(trip.fromLoc || 'Unknown start').trim() + ' → ' +
        String(trip.toLoc || 'Unknown destination').trim());
      routes.set(route, (routes.get(route) || 0) + 1);
    }
    const topRoute = [...routes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return { text: 'Your most frequent route in ' + scopeLabel + ' is ' + topRoute[0] +
      ', with ' + topRoute[1] + ' ' + (topRoute[1] === 1 ? 'trip' : 'trips') + '.',
      actions: [{ label: 'Browse trips', tab: 'trips' }]
    };
  }

  const asksForSummary = /\b(summary|summari[sz]e|analysis|analyze|analyse|report|overall|how much|how many|what (?:are|were) my .*expenses|what did i spend|total)\b/i.test(text);
  if (!asksForSummary) return requestGenerativeReply(rawText);

  const visitorText = topVisitor
    ? '\nMost visited client: ' + topVisitor[0] + ' (' + topVisitor[1] + ' ' +
      (topVisitor[1] === 1 ? 'trip' : 'trips') + ').'
    : '';
  return {
    text: 'Here is your ' + scopeLabel + ' summary:\n' + summary.count + ' ' +
      (summary.count === 1 ? 'trip' : 'trips') + ' · ' + summary.km.toFixed(1) + ' km' +
      '\nPetrol: ' + formatAmount(summary.petrol) +
      '\nParking: ' + formatAmount(summary.parking) +
      '\nTotal expenses: ' + formatAmount(summary.total) + visitorText,
    actions: [{ label: 'Open summary', tab: 'reports' }, { label: 'Browse trips', tab: 'trips' }]
  };
}
