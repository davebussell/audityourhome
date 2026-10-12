/** Example data for the My Home preview shown before someone signs in. */
const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

export function demoData() {
  const home = {
    id: 'demo-home', label: 'Our house', postal_code: 'K2B7J4', province: 'ON', city_slug: 'ottawa', city_name: 'Ottawa',
    era: '1966-1980', home_type: 'detached', size_band: 'medium', heating: 'gas', heating_age: 'old',
    water_heater: 'gastank', cooling: 'central-old', windows: 'double-old', water_supply: 'municipal',
    prev_audit: 'recent', secondary: [], planner_query: '?postal=K2B7J4&age=1966-1980&htype=detached&size=medium&heat=gas&hage=old&wh=gastank&ac=central-old&win=double-old&prev=recent&done=1',
    notes: '',
  };
  return {
    demo: true,
    profile: { id: 'demo', email: 'you@example.com', full_name: 'Sam Example', phone: '', is_admin: false },
    homes: [home],
    audits: [
      { id: 'a1', home_id: 'demo-home', kind: 'energuide-pre', done_on: iso(-40), company: 'A registered energy advisor', result: 'EnerGuide rating 162 GJ/year', rating_gj: 162, radon_bq: null, file_ref: '', notes: 'Biggest leaks: attic hatch and rim joists.' },
      { id: 'a2', home_id: 'demo-home', kind: 'radon-test', done_on: iso(-400), company: 'Lab kit', result: '95 Bq/m³ (below the guideline)', rating_gj: null, radon_bq: 95, file_ref: '', notes: '' },
    ],
    needs: [
      { id: 'n1', home_id: 'demo-home', item_key: 'air-sealing', title: 'Air sealing', category: 'air-sealing', status: 'done', priority: 1, cost_low: 400, cost_high: 1500, saving_year: 160, rebate: '', notes: '', source: 'planner', done_on: iso(-10) },
      { id: 'n2', home_id: 'demo-home', item_key: 'attic-insulation', title: 'Top up attic insulation to R-60', category: 'attic-insulation', status: 'quotes', priority: 2, cost_low: 1500, cost_high: 3500, saving_year: 210, rebate: 'Home Renovation Savings insulation rebate', notes: 'Two quotes booked.', source: 'planner', done_on: null },
      { id: 'n3', home_id: 'demo-home', item_key: 'heat-pump', title: 'Cold-climate heat pump', category: 'heat-pump', status: 'todo', priority: 3, cost_low: 9000, cost_high: 18000, saving_year: 120, rebate: 'Home Renovation Savings heat pump rebate', notes: '', source: 'planner', done_on: null },
      { id: 'n4', home_id: 'demo-home', item_key: 'water-heating', title: 'Heat pump water heater when the tank fails', category: 'water-heating', status: 'todo', priority: 4, cost_low: 3000, cost_high: 5000, saving_year: 180, rebate: '', notes: '', source: 'planner', done_on: null },
    ],
    reminders: [
      { id: 'r1', home_id: 'demo-home', title: 'Book the follow-up EnerGuide evaluation', due_on: iso(35), kind: 'post-evaluation', notes: 'Needed to claim the rebates.', done: false },
      { id: 'r2', home_id: 'demo-home', title: 'Send the attic insulation receipts', due_on: iso(70), kind: 'rebate-claim', notes: '', done: false },
    ],
    prefs: { program_updates: true, deadline_reminders: true, seasonal_checks: true, provinces: ['ON'], consent_at: iso(-40), unsubscribed_at: null },
    requests: [
      { id: 'm1', service: 'insulation', timeline: '1-3-months', status: 'matched', created_at: iso(-12), matched_company: 'A local insulation contractor', matched_contact: '613-555-0100', homeowner_note: 'They will call this week to book a site visit.', details: 'Attic top-up after our EnerGuide evaluation.', contact_pref: 'phone' },
    ],
    updates: [] as { id?: string; slug?: string; title: string; summary: string; url?: string | null; published_at: string; provinces: string[] }[],
  };
}
