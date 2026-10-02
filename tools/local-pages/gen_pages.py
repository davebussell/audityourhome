#!/usr/bin/env python3
"""Generate the /services/<service>/<city>/ page payloads from out/cities.json.

Writes into the site repo:
  src/data/local/index.json            services, cities (hub metrics), provinces
  src/data/local/cities/<slug>.json    one file per city: city facts + 16 service page payloads + hub payload
"""
import html
import json
import os
import re
import statistics
import sys

SVC = os.path.dirname(os.path.abspath(__file__))  # tools/local-pages
REPO = os.path.abspath(os.path.join(SVC, '..', '..'))  # repo root
D = json.load(open(f'{SVC}/out/cities.json'))
CITIES = D['cities']
BY = {c['slug']: c for c in CITIES}
PROVS = D['provinces']
NAT = D['national']
INCENT = D['incentives']
UTIL = D['utilities']
PROGRAMS = json.load(open(f'{REPO}/src/data/programs.json'))
CHECKED = 'September 28, 2026'
CHECKED_ISO = '2026-09-28'
MINUS = '−'

esc = html.escape


def a(href, text, ext=False):
    rel = ' rel="noopener"' if ext or href.startswith('http') else ''
    return f'<a href="{esc(href, quote=True)}"{rel}>{text}</a>'


def p(*parts):
    return '<p>' + ' '.join(x for x in parts if x) + '</p>'


def ul(items):
    return '<ul>' + ''.join(f'<li>{i}</li>' for i in items if i) + '</ul>'


def n(x):
    return f'{x:,}'


def deg(t):
    t = float(t)
    s = f'{abs(t):.1f}'.rstrip('0').rstrip('.') if abs(t) != int(abs(t)) else f'{int(abs(t))}'
    return (MINUS if t < 0 else '') + s + '°C'


def pct(v, digits=0):
    if v is None:
        return None
    if digits == 0:
        return f'{round(v)}%'
    return f'{v:.{digits}f}%'.replace('.0%', '%')


def ordinal(k):
    if 10 <= k % 100 <= 20:
        suf = 'th'
    else:
        suf = {1: 'st', 2: 'nd', 3: 'rd'}.get(k % 10, 'th')
    return f'{k}{suf}'


def rank_phrase(k, total, what_hi, what_lo):
    """'the 5th-coldest' style phrasing; k is 1-based rank from the high end."""
    if k == 1:
        return f'the {what_hi}'
    if k <= total // 2:
        return f'the {ordinal(k)}-{what_hi.split(" ", 1)[0]}' if False else f'{ordinal(k)} {what_hi}'
    j = total - k + 1
    if j == 1:
        return f'the {what_lo}'
    return f'{ordinal(j)} {what_lo}'


# ------------------------------------------------------------------ sources
SRC = {
    'hot2000': ('NRCan — HOT2000 Climate Map: heating degree-days and design temperatures for 403 locations',
                'https://open.canada.ca/data/en/dataset/4672733b-bbb6-4299-a57f-f19ab475ac11'),
    'census': ('Statistics Canada — 2021 Census, households by period of construction and dwelling type (table 98-10-0233-01)',
               'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810023301'),
    'pop': ('Statistics Canada — 2021 Census population and dwelling counts (table 98-10-0002-01)',
            'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810000201'),
    'heating': ('Statistics Canada — Households and the Environment Survey 2023, primary heating systems (table 38-10-0286-01)',
                'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3810028601'),
    'nrcan-so': ('NRCan — Service organizations for existing homes (list checked September 25, 2026)',
                 'https://natural-resources.canada.ca/energy-efficiency/home-energy-efficiency/find-service-organizations-existing-homes'),
    'radon2012': ('Health Canada — Cross-Canada Survey of Radon Concentrations in Homes, final report (2012), Table 5',
                  'https://www.canada.ca/en/health-canada/services/environmental-workplace-health/reports-publications/radiation/cross-canada-survey-radon-concentrations-homes-final-report-health-canada-2012.html'),
    'radon2024': ('Evict Radon National Study with Health Canada — 2024 Cross-Canada Survey of Radon Exposure (report v1.1)',
                  'https://evictradon.org/wp-content/uploads/2025/11/2024-Cross-Canada-Radon-Survey-Report-V24.pdf'),
    'hc-radon': ('Health Canada — Government of Canada radon guideline',
                 'https://www.canada.ca/en/health-canada/services/health-risks-safety/radiation/radon/government-canada-radon-guideline.html'),
    'cnrpp': ('C-NRPP — Find a radon professional', 'https://c-nrpp.ca/find-a-professional/'),
    'hc-vermiculite': ('Health Canada — Vermiculite insulation containing asbestos',
                       'https://www.canada.ca/en/health-canada/services/air-quality/indoor-air-contaminants/health-risks-asbestos.html'),
    'hc-lead': ('Health Canada — Lead-based paint', 'https://www.canada.ca/en/health-canada/services/home-safety/lead-based-paint.html'),
    'hc-mould': ('Health Canada — Residential indoor air quality guideline: moulds',
                 'https://www.canada.ca/en/health-canada/services/publications/healthy-living/residential-indoor-air-quality-guideline-moulds.html'),
    'nvlap': ('NIST NVLAP — accredited laboratory directory (asbestos analysis)', 'https://www.nist.gov/nvlap'),
    'aihalap': ('AIHA Laboratory Accreditation Programs — EMLAP (mould) and ELLAP (lead) directory',
                'https://www.aihaaccreditedlabs.org/'),
    'cala': ('CALA — Canadian Association for Laboratory Accreditation directory', 'https://cala.ca/'),
    'ashrae211': ('ASHRAE — Standards 180 and 211 (ANSI/ASHRAE/ACCA 211, commercial building energy audits)',
                  'https://www.ashrae.org/technical-resources/bookstore/standards-180-and-211'),
    'portfolio': ('NRCan — Energy benchmarking with ENERGY STAR Portfolio Manager',
                  'https://natural-resources.canada.ca/energy-efficiency/energy-star/energy-benchmarking-energy-starr-portfolio-managerr'),
}


class Sources:
    def __init__(self):
        self.items = []

    def add(self, key_or_label, href=None):
        if href is None:
            label, href = SRC[key_or_label]
        else:
            label = key_or_label
        if href and not any(h == href for _, h in self.items):
            self.items.append((label, href))

    def out(self):
        return [{'label': l, 'href': h} for l, h in self.items]


# ------------------------------------------------------------------ province texts (from research/*.json, checked 2026-09-28)
PT = {
    'ON': dict(
        co=(True, "Ontario's Fire Code requires CO alarms in existing homes that have a fuel-burning appliance, a fireplace or an attached garage: next to every sleeping area and, since January 1, 2026, on every storey as well.",
            'https://www.ontario.ca/laws/regulation/r25087'),
        asb=("In Ontario, O. Reg. 278/05 sets the rules for contractors working with asbestos. Owners must have materials checked before arranging renovation or demolition work, but that duty doesn't apply to an owner-occupied house or a building of four units or fewer, so testing your own home is your decision.",
             'https://www.ontario.ca/laws/regulation/050278'),
        radonCode=("Since January 1, 2025, the Ontario Building Code requires new houses to include a soil-gas barrier and a radon rough-in.",
                   'https://www.cityofkingston.ca/building-and-renovating/building-permits/2024-ontario-building-code-updates/'),
        radonKits=("There's no provincial free-kit program, but many Ontario public libraries lend digital radon monitors free with a library card, among them Hamilton, Vaughan, Guelph, Kingston Frontenac, Greater Sudbury, Thunder Bay, Brantford and Waterloo.",
                   'https://takeactiononradon.ca/resources/lending-programs/'),
        radonHelp=("Tarion's new-home warranty covers radon remediation for seven years from possession, and the Canadian Lung Association's Lungs Matter program offers up to $1,500 toward mitigation for households with low to moderate incomes or a lung cancer diagnosis.",
                   [('Tarion — eight quick facts about radon (new-home warranty)', 'https://www.tarion.com/media/eight-quick-facts-about-radon'),
                    ('Canadian Lung Association — Lungs Matter radon mitigation funding', 'https://www.lung.ca/how-to-protect-your-lungs/air-quality/radon/lungs-matter-radon/')]),
        wells=("Free bacteria testing through Public Health Ontario labs: pick up a kit at a PHO lab or your public health unit and drop it back off. Chemistry (nitrate, sodium, metals) goes to a licensed private lab for a fee. Local health units recommend testing at least three times a year: spring, summer and fall.",
               'https://www.ontario.ca/page/testing-and-treating-private-water-wells'),
        wellCost='Bacteria free (Public Health Ontario)',
        evalPrice=("Windfall Ecology Centre, one of the few Ontario providers that publishes prices, charges $500 + HST for the initial evaluation and $250 + HST for the follow-up; Reep Green Solutions lists $540. City-backed programs in Ottawa and London quote $500–$700 as typical.",
                   'https://windfallcentre.ca/energy/evaluation/'),
        evalShort='About $500–$700',
    ),
    'QC': dict(
        co=(False, "Quebec has no province-wide rule requiring CO alarms in existing houses: provincial rules cover larger multi-unit buildings, and for houses it's up to each municipality's by-law, so ask your local fire service.",
            'https://www.legisquebec.gouv.qc.ca/fr/version/rc/B-1.1,%20r.%203?code=se%3A359'),
        asb=("In Quebec, CNESST rules require contractors to check for asbestos before any work that could release dust, and the province tells homeowners to have suspect materials checked by a qualified contractor or an IRSST-recognized lab and never to do asbestos work themselves. Quebec treats material as asbestos-containing from 0.1% asbestos, a stricter line than most provinces.",
             'https://www.cnesst.gouv.qc.ca/fr/prevention-securite/identifier-corriger-risques/liste-informations-prevention/amiante'),
        radonCode=("Quebec's construction code requires a soil-gas barrier in new dwellings and, since April 17, 2025, a passive radon exhaust stack.",
                   'https://www.rbq.gouv.qc.ca/domaines-dintervention/batiment/la-reglementation/chapitre-batiment-du-code-de-construction/chapitre-batiment-du-code-de-construction-du-quebec-incluant-le-cnb-2020/'),
        radonKits=("The Association pulmonaire du Québec sells long-term detectors for about $50 including analysis, and some municipal libraries lend electronic monitors.",
                   'https://www.quebec.ca/habitation-territoire/milieu-de-vie-sain/radon-domiciliaire'),
        radonHelp=("The Canadian Lung Association's Lungs Matter program offers up to $1,500 toward mitigation for households with low to moderate incomes or a lung cancer diagnosis.", 'https://www.lung.ca/how-to-protect-your-lungs/air-quality/radon/lungs-matter-radon/'),
        wells=("There's no free provincial service: send samples to a lab accredited by Quebec's environment ministry (the CEAEQ list), which supplies the bottles. The ministry recommends testing for bacteria at least twice a year, in spring and fall, plus a chemical analysis while the well is in use.",
               'https://www.environnement.gouv.qc.ca/eau/potable/depliant/'),
        wellCost='Paid, accredited lab',
        evalPrice=("In Quebec, EnerGuide evaluations are booked through the provincial Rénoclimat program: the pre-retrofit evaluation costs $150 plus taxes, reimbursed when you receive financial assistance under the program, and the first post-retrofit evaluation is free.",
                   'https://www.quebec.ca/en/housing-territory/heating-energy-consumption/financial-assistance-retrofits/renoclimat/energy-evaluations/energy-evaluation-fees'),
        evalShort='$150 + tax (Rénoclimat)',
    ),
    'BC': dict(
        co=(False, "B.C. doesn't require CO alarms in existing homes; the province recommends them wherever there's a fuel-burning appliance, fireplace or attached garage, and the building code requires them in new homes.",
            'https://www2.gov.bc.ca/gov/content/safety/public-safety/fire-safety/legislation-regulations-codes/codes-bulletins'),
        asb=("B.C. has Canada's strictest regime: before renovation or demolition work, a qualified person must inspect and sample for hazardous materials such as asbestos and lead (OHS Regulation s. 20.112), and since January 1, 2024, asbestos abatement contractors must be licensed by WorkSafeBC.",
             'https://www.worksafebc.com/en/health-safety/education-training-certification/asbestos-training-certification-licensing'),
        radonCode=("Since March 2024, the BC Building Code requires a radon rough-in in all new houses province-wide.",
                   'https://www2.gov.bc.ca/assets/gov/farming-natural-resources-and-industry/construction-industry/building-codes-and-standards/bulletins/2024-code/b24-03-r_radon.pdf'),
        radonKits=("BC Lung's library lending program puts radon detectors in many BC libraries, free with a library card, and the BC Centre for Disease Control publishes a BC Radon Map of results by area.",
                   'https://bclung.ca/radon'),
        radonHelp=("The Canadian Lung Association's Lungs Matter program offers up to $1,500 toward mitigation for households with low to moderate incomes or a lung cancer diagnosis.", 'https://www.lung.ca/how-to-protect-your-lungs/air-quality/radon/lungs-matter-radon/'),
        wells=("There's no free provincial program: use a qualified lab (search the CALA directory), which supplies the bottles. HealthLinkBC recommends testing for bacteria at least once a year and for chemistry when the well is new and annually after that.",
               'https://www.healthlinkbc.ca/healthlinkbc-files/well-water-testing'),
        wellCost='Paid, private lab',
        evalPrice=("There's no provincial price list; the City of Nanaimo quotes $400–$500 as typical for an existing home. Several B.C. municipalities subsidize evaluations for their residents (see local programs below).",
                   'https://www.nanaimo.ca/property-development/rebates/home-energy-efficiency-rebate/how-to-receive-your-home-energy-assessment-rebate'),
        evalShort='About $400–$500',
    ),
    'AB': dict(
        co=(False, "Alberta requires CO alarms in new homes with a fuel-burning appliance or attached garage; for existing homes the province calls them highly recommended rather than mandatory.",
            'https://ebs.safetycodes.ab.ca/documents/webdocs/PI/safety-tips_carbon-monoxide_jan2020.pdf'),
        asb=("Alberta's OHS Code requires certified workers for asbestos removal, and anyone planning asbestos removal, or demolition or renovation of a building containing asbestos, must notify Alberta OHS at least 72 hours before starting.",
             'https://www.alberta.ca/asbestos-worker-training'),
        radonCode=("Alberta's building code requires a soil-gas barrier and a radon rough-in in new homes.",
                   'https://www.alberta.ca/building-codes-and-standards'),
        radonKits=("Alberta Lung supports free radon-monitor lending at libraries including Edmonton Public Library and Red Deer Public Library; long-term kits are sold separately.",
                   'https://takeactiononradon.ca/resources/lending-programs/'),
        radonHelp=("The Canadian Lung Association's Lungs Matter program offers up to $1,500 toward mitigation for households with low to moderate incomes or a lung cancer diagnosis.", 'https://www.lung.ca/how-to-protect-your-lungs/air-quality/radon/lungs-matter-radon/'),
        wells=("Alberta Health Services tests private well water free, for bacteria plus chemistry and trace metals; pick up bottles at AHS facilities. Test for bacteria twice a year and for chemistry every three years.",
               'https://myhealth.alberta.ca/Alberta/Pages/Testing-Your-Drinking-Water-in-Alberta.aspx'),
        wellCost='Free (Alberta Health Services)',
        evalPrice=("There's no provincial rebate or price list; the City of Edmonton's guidance is to expect more than $400 and to get two or three quotes.",
                   'https://homes.changeforclimate.ca/hera/'),
        evalShort='Expect $400+',
    ),
    'SK': dict(
        co=(True, "Saskatchewan requires CO alarms in all residential buildings regardless of age (enforced since July 1, 2022), and from November 1, 2026, 'Henry's Law' requires one in every residential suite, including secondary suites.",
            'https://www.saskatchewan.ca/business/housing-development-construction-and-property-management/building-and-technical-standards/carbon-monoxide-alarms-and-smoke-alarms'),
        asb=("Saskatchewan requires a competent person to inventory asbestos-containing materials in workplace buildings, and contractors must notify Occupational Health and Safety at least 14 days before high-risk asbestos work.",
             'https://www.saskatchewan.ca/business/safety-in-the-workplace/hazards-and-prevention/asbestos-in-saskatchewan/understanding-identifying-and-handling-asbestos'),
        radonCode=("Since January 1, 2024, Saskatchewan's adoption of the 2020 National Building Code requires a radon rough-in in new homes.",
                   'https://www.saskatchewan.ca/business/housing-development-construction-and-property-management/building-and-technical-standards'),
        radonKits=("Lung Saskatchewan sells long-term kits for $65 including lab analysis and supports free monitor lending at libraries including the Regina and Saskatoon public libraries.",
                   'https://www.lungsask.ca/education/programs-support/find-radon-monitor-lending-program'),
        radonHelp=("Saskatchewan's Home Renovation Tax Credit is back for 2025 and later tax years, and Lung Saskatchewan lists radon mitigation as an eligible expense.",
                   'https://www.saskatchewan.ca/residents/taxes-and-investments/tax-credits/home-renovation-tax-credit'),
        wells=("The Roy Romanow Provincial Laboratory tests well water for a fee: $23 for bacteria and $29 for a potability panel in its published schedule (confirm current prices). Bottles are at rural municipality and public health offices. Test yearly for bacteria and nitrate.",
               'https://www.saskhealthauthority.ca/facilities-locations/roy-romanow-provincial-laboratory/water-testing-public/getting-water-tested'),
        wellCost='$23 bacteria (provincial lab)',
        evalPrice=("There's no provincial rebate; the City of Saskatoon quotes $500–$600 as typical for the initial EnerGuide evaluation and $300–$400 for the follow-up.",
                   'https://www.saskatoon.ca/sites/default/files/media/documents/What%20is%20an%20Energy%20Audit-Mar13.pdf'),
        evalShort='About $500–$600',
    ),
    'MB': dict(
        co=(False, "Manitoba's Fire Code requires CO detection only in buildings subject to fire-safety inspections, not in ordinary private homes, so installing alarms is up to you.",
            'https://web2.gov.mb.ca/laws/regs/current/082-2023.php?lang=en'),
        asb=("Manitoba's workplace rules treat suspect material as asbestos until a qualified person says otherwise, and from June 1, 2027, asbestos sampling and abatement work will require a provincial certificate.",
             'https://web2.gov.mb.ca/laws/regs/current/217-2006.php?lang=en'),
        radonCode=("Manitoba's building code (the 2020 National Building Code) requires a soil-gas barrier and a radon rough-in in new homes.",
                   'https://web2.gov.mb.ca/laws/regs/current/078-2023.php'),
        radonKits=("The Manitoba Lung Association sells long-term kits and runs a library lending program, and Manitoba Hydro's Home Energy Efficiency Loan can finance radon mitigation up to $5,000 (C-NRPP-certified contractor required).",
                   'https://www.gov.mb.ca/health/publichealth/environmentalhealth/radon.html'),
        radonHelp=("The Canadian Lung Association's Lungs Matter program offers up to $1,500 toward mitigation for households with low to moderate incomes or a lung cancer diagnosis.", 'https://www.lung.ca/how-to-protect-your-lungs/air-quality/radon/lungs-matter-radon/'),
        wells=("Manitoba's Private Well Testing Subsidy covers one bacteria test a year for $17.67 at Duracan Laboratory in Winnipeg, with a free re-test after a positive result. Test at least once a year, ideally after snowmelt.",
               'https://www.gov.mb.ca/sd/water/drinking-water/well-videos/index.html'),
        wellCost='$17.67 bacteria (subsidized)',
        evalPrice=("Efficiency Manitoba rebates $400 on a pre-retrofit EnerGuide evaluation if you own the home, it has Manitoba Hydro residential service and you plan at least one upgrade within 12 months. Apply within 90 days.",
                   'https://efficiencymb.ca/my-home/energuide-home-evaluation-rebate/'),
        evalShort='$400 rebate',
    ),
    'NS': dict(
        co=(False, "Nova Scotia's building code requires CO alarms in new homes with a fuel-burning appliance or attached garage, but older homes don't have to be retrofitted; the province recommends them.",
            'https://novascotia.ca/lae/healthandsafety/docs/Carbon_Monoxide-Safety.pdf'),
        asb=("Nova Scotia's Asbestos Waste Management Regulations apply to anyone, homeowners included: friable asbestos waste must be wetted, double-bagged and taken only to an approved disposal site that has agreed to accept it.",
             'https://novascotia.ca/just/regulations/regs/envasbestos.htm'),
        radonCode=("Nova Scotia's building code (the 2020 National Building Code, effective April 1, 2025) requires a radon rough-in in new homes.",
                   'https://novascotia.ca/just/regulations/regs/bcregs.htm'),
        radonKits=("LungNSPEI's pilot Radon Reduction Grant Program provides free test kits and mitigation grants of up to $2,500 to low-income Nova Scotia households, and its library loan program lends detectors through public libraries; Nova Scotia also publishes a Radon Risk Map.",
                   'https://www.lungnspei.ca/radonreductiongrantprogram'),
        radonHelp=("The Canadian Lung Association's Lungs Matter program offers up to $1,500 toward mitigation for households with low to moderate incomes or a lung cancer diagnosis.", 'https://www.lung.ca/how-to-protect-your-lungs/air-quality/radon/lungs-matter-radon/'),
        wells=("Owners pay: Nova Scotia Health charges $34.50 for a bacteria test and $37.63 to $138.77 for chemical packages, with bottles at NSH locations. The province recommends testing for bacteria every year and for chemicals every five years.",
               'https://novascotia.ca/well-water-testing/'),
        wellCost='$34.50 bacteria (Nova Scotia Health)',
        evalPrice=("Efficiency Nova Scotia's Home Energy Assessment program charges a $199 program fee (waived for moderate-income households) and covers the initial and final assessments.",
                   'https://www.efficiencyns.ca/programs-rebates/home-energy-assessments'),
        evalShort='$199 program fee',
    ),
    'NB': dict(
        co=(None, "We found no New Brunswick rule requiring CO alarms in existing homes; new construction follows the 2020 National Building Code.",
            'https://www.gnb.ca/en/topic/laws-safety/licensing-inspections/technical-inspections/building-code.html'),
        asb=("In New Brunswick, employers and contractors who disturb asbestos-containing material must follow WorkSafeNB's code of practice for working with asbestos.",
             'https://laws.gnb.ca/en/document/cr/91-191'),
        radonCode=("New Brunswick applies the 2020 National Building Code, which requires a radon rough-in in new homes.",
                   'https://www.gnb.ca/en/topic/laws-safety/licensing-inspections/technical-inspections/building-code.html'),
        radonKits=("NB Lung's Check Out Radon program lends free electronic screening kits, and the province says about one in four New Brunswick homes exceed the guideline.",
                   'https://nblung.ca/radon-lending-program/'),
        radonHelp=("The province lists the Homeowner Repair Program and the Canadian Lung Association's Lungs Matter program (up to $1,500) as possible help with mitigation costs.",
                   'https://www.gnb.ca/en/topic/laws-safety/health-environment-advisories/radon.html'),
        wells=("Owners pay: test kits are at Service New Brunswick offices or RPC, the designated provincial lab in Fredericton and Moncton. The province recommends testing for bacteria twice a year and for inorganic contaminants every two years.",
               'https://www.gnb.ca/en/topic/environment-resources/water/safe-drinking-water.html'),
        wellCost='Paid (RPC or accredited lab)',
        evalPrice=("Through the Total Home Energy Savings Program, a Certified Energy Advisor charges $99 + HST, covering both the initial and final evaluations.",
                   'https://www.saveenergynb.ca/en/for-home/total-home/frequently-asked-questions/'),
        evalShort='$99 + HST',
    ),
    'PE': dict(
        co=(None, "PEI's Fire Marshal advises CO alarms outside each sleeping area and on every level, but we found no rule requiring them in existing homes.",
            'https://www.princeedwardisland.ca/en/information/justice-and-public-safety/fire-prevention-resources'),
        asb=("PEI requires a competent person to take samples, a CALA- or AIHA-accredited lab to analyze them, and a certified asbestos contractor for asbestos work.",
             'https://ohsguide.wcb.pe.ca/topic/asbestos.html'),
        radonCode=("PEI requires new homes to include a vapour barrier and a rough-in for a radon reduction system.",
                   'https://www.princeedwardisland.ca/en/information/health-and-wellness/radon'),
        radonKits=("Kits can be borrowed through the Provincial Library Service or ordered from LungNSPEI.",
                   'https://www.princeedwardisland.ca/en/information/health-and-wellness/radon'),
        radonHelp=("The province points residents to the Canadian Lung Association's Lungs Matter program (up to $1,500) for mitigation funding.", 'https://www.lung.ca/how-to-protect-your-lungs/air-quality/radon/lungs-matter-radon/'),
        wells=("Free since January 1, 2022: bacteria and general chemistry for residential wells through PEI Analytical Laboratories, with bottles at the lab or any Access PEI site. Test for bacteria yearly and chemistry every two years.",
               'https://www.princeedwardisland.ca/en/information/environment-energy-and-climate-action/testing-of-drinking-water'),
        wellCost='Free (bacteria and chemistry)',
        evalPrice=("efficiencyPEI's subsidized home energy assessment costs $99 + HST, booked directly with one of its efficiency partners.",
                   'https://www.princeedwardisland.ca/en/information/energy/home-energy-assessments'),
        evalShort='$99 + HST',
    ),
    'NL': dict(
        co=(None, "Newfoundland and Labrador's fire regulations require smoke alarms in existing homes but contain no CO alarm requirement.",
            'https://www.assembly.nl.ca/legislation/sr/regulations/rc120045.htm'),
        asb=("In Newfoundland and Labrador, only certified asbestos abatement contractors may remove asbestos, and removal needs written notice to the OHS Division and a disposal permit.",
             'https://www.assembly.nl.ca/legislation/sr/regulations/rc980111.htm'),
        radonCode=("Newfoundland and Labrador leaves building rules for new houses to municipal by-laws, so radon measures in new homes depend on the municipality.",
                   'https://www.assembly.nl.ca/legislation/sr/regulations/rc120045.htm'),
        radonKits=("There's no provincial kit program; several NL public libraries lend radon monitors.",
                   'https://takeactiononradon.ca/resources/lending-programs/'),
        radonHelp=("The Canadian Lung Association's Lungs Matter program offers up to $1,500 toward mitigation for households with low to moderate incomes or a lung cancer diagnosis.", 'https://www.lung.ca/how-to-protect-your-lungs/air-quality/radon/lungs-matter-radon/'),
        wells=("Free bacteria testing: sterile bottles are at Government Service Centres and the NL Public Health Laboratory. Chemistry goes to an approved private lab for a fee.",
               'https://www.gov.nl.ca/gs/licences/env-health/water/'),
        wellCost='Bacteria free',
        evalPrice=("There's no province-wide price; takeCHARGE lists the service organizations working in the province without prices.",
                   'https://takechargenl.ca/'),
        evalShort='Varies',
    ),
    'YT': dict(
        co=(True, "Yukon requires CO detectors in every residence with a fuel-burning appliance or attached garage.",
            'https://yukon.ca/en/emergencies-and-safety/home-fire-safety/prevent-carbon-monoxide-poisoning'),
        asb=("Yukon requires a competent person to identify asbestos and lead before a building is demolished, with removal by a certified asbestos control contractor.",
             'https://www.wcb.yk.ca/regulations/occupational-health-regulations'),
        radonCode=("Yukon enforces the 2020 National Building Code with territorial variations; its soil-gas section requires a radon rough-in in new homes.",
                   'https://yukon.ca/en/housing-and-property/building-and-renovating/get-yukon-related-updates-national-building-code'),
        radonKits=("Yukon public libraries lend free radon screening kits from November to May, with 10 at the Whitehorse Public Library, and the Yukon government says there's radon in every Whitehorse subdivision.",
                   'https://yukon.ca/en/housing-and-property/home-and-property-maintenance/test-your-home-radon'),
        radonHelp=None,
        wells=("Free bacteria testing at Yukon's Environmental Health Services water lab in Whitehorse (867-667-8391). No Yukon lab tests chemistry, so those samples go to accredited labs in B.C. or Alberta, often around $200 plus shipping.",
               'https://yukon.ca/en/health-and-wellness/drinking-water/get-your-drinking-water-tested'),
        wellCost='Bacteria free',
        evalPrice=("Yukon's Good Energy program arranges reduced-cost assessments with local energy advisors: $50 for a pre-renovation assessment and $50 for the return visit.",
                   'https://yukon.ca/en/energy-assessment'),
        evalShort='$50 (Good Energy)',
    ),
    'NT': dict(
        co=(None, "We found no NWT requirement for CO alarms in existing homes; the territory's fire regulations adopt the national codes for new construction.",
            'https://www.justice.gov.nt.ca/en/files/legislation/fire-prevention/fire-prevention.r1.pdf'),
        asb=("The NWT's Asbestos Abatement Code of Practice calls a building survey an important step before renovating or demolishing pre-1980 buildings, and asbestos waste must be handled as hazardous waste.",
             'https://www.wscc.nt.ca/sites/default/files/documents/Asbestos%20Abatement%20Code%20of%20Practice%20NT%20and%20NU%20English.pdf'),
        radonCode=("The NWT adopted the 2020 National Building Code in full (enforced October 1, 2024), including its radon rough-in for new homes.",
                   'https://cbhcc-cchcc.ca/en/provincial-territorial-adoption/'),
        radonKits=("We found no NWT radon program; long-term kits can be ordered from lung associations.",
                   'https://takeactiononradon.ca/'),
        radonHelp=None,
        wells=("There's no free program: the GNWT's Taiga Environmental Laboratory in Yellowknife tests private samples ($28 for bacteria in its 2021 price guide) and supplies bottles free.",
               'https://www.gov.nt.ca/ecc/en/services/taiga-environmental-laboratory'),
        wellCost='$28 bacteria (Taiga lab)',
        evalPrice=("The Arctic Energy Alliance delivers subsidized EnerGuide evaluations: $200 + GST for a single-family existing home.",
                   'https://aea.nt.ca/program/home-energy-evaluations/'),
        evalShort='$200 + GST (AEA)',
    ),
}
# city-specific CO notes
CITY_CO = {
    'vancouver': ("The City of Vancouver's Fire By-law goes further than the province and does require CO alarms in existing homes with an attached garage or a fuel-fired appliance.",
                  'https://vancouver.ca/home-property-development/carbon-monoxide-alarms.aspx'),
}
CITY_RADON_KITS = {
    'st-johns': ("The City of St. John's has run free radon kit programs for residents, including about 250 kits in its November 2025 round.",
                 'https://www.stjohns.ca/news/posts/free-radon-test-kits-return-for-2025-for-st-johns-residents/'),
}

# ------------------------------------------------------------------ programs by province
PROV_PROGRAMS = {
    'ON': ['home-renovation-savings-assessment', 'home-renovation-savings-direct'],
    'QC': ['renoclimat', 'logisvert'],
    'BC': ['bc-home-energy-improvement-bonus', 'cleanbc-energy-savings-program'],
    'AB': ['alberta-clean-energy-improvement-program'],
    'SK': [],
    'MB': ['efficiency-manitoba-rebates'],
    'NS': ['efficiency-nova-scotia-rebates'],
    'NB': ['nb-total-home-energy-savings'],
    'PE': ['efficiency-pei-rebates'],
    'NL': ['takecharge-nl'],
    'YT': ['territories-energy-programs'],
    'NT': ['territories-energy-programs'],
}
FEDERAL = ['cmhc-eco-improvement', 'canada-greener-homes-affordability-program']
CGHAP_PROVS = {'BC', 'MB', 'NS', 'PE', 'QC'}
PROG = {x['slug']: x for x in PROGRAMS}


def programs_for(c, need_audit=None):
    out = []
    for s in PROV_PROGRAMS[c['prov']]:
        x = PROG[s]
        if x['status'] == 'closed':
            continue
        if need_audit is not None and bool(x.get('auditRequired')) != need_audit:
            continue
        out.append({'name': x['name'], 'href': f'/programs/{s}/', 'summary': x['headline'],
                    'status': x['status'], 'kind': 'Provincial' if c['prov'] not in ('YT', 'NT') else 'Territorial',
                    'audit': bool(x.get('auditRequired'))})
    if c['slug'] == 'toronto' and need_audit in (None, True):
        x = PROG['toronto-home-energy-loan-program']
        out.append({'name': x['name'], 'href': '/programs/toronto-home-energy-loan-program/', 'summary': x['headline'],
                    'status': x['status'], 'kind': 'Municipal', 'audit': True})
    for s in FEDERAL:
        x = PROG[s]
        if x['status'] == 'closed':
            continue
        if s == 'canada-greener-homes-affordability-program' and c['prov'] not in CGHAP_PROVS:
            continue
        if need_audit is not None and bool(x.get('auditRequired')) != need_audit:
            continue
        out.append({'name': x['name'], 'href': f'/programs/{s}/', 'summary': x['headline'], 'status': x['status'],
                    'kind': 'Federal', 'audit': bool(x.get('auditRequired'))})
    return out


def municipal_for(c, types=None):
    out = []
    for m in c['municipal']:
        if m.get('status') == 'closed':
            continue
        if types and m['type'] not in types:
            continue
        if c['slug'] == 'toronto' and 'HELP' in m['name']:
            continue  # shown as a program card already
        out.append({'name': m['name'], 'href': m['url'], 'summary': m['summary'], 'status': m['status'], 'kind': 'Municipal'})
    return out


# ------------------------------------------------------------------ city-derived metrics
HDD_SORTED = sorted(CITIES, key=lambda c: -c['climate']['hdd'])
HDD_RANK = {c['slug']: i + 1 for i, c in enumerate(HDD_SORTED)}
DT_SORTED = sorted(CITIES, key=lambda c: c['climate']['designHeat'])
DT_RANK = {c['slug']: i + 1 for i, c in enumerate(DT_SORTED)}
AGE_SORTED = sorted(CITIES, key=lambda c: -(c['housing']['housesPre1961Pct'] or 0))
AGE_RANK = {c['slug']: i + 1 for i, c in enumerate(AGE_SORTED)}
NCITY = len(CITIES)
MED_HDD = statistics.median(c['climate']['hdd'] for c in CITIES)


def cname(c):
    return c['name']


def in_city(c):
    return c['name']


def climate_src_phrase(c):
    cl = c['climate']
    if cl['km'] <= 20 and not cl.get('override'):
        return f"NRCan's HOT2000 climate data for {cl['station']}"
    return f"NRCan's HOT2000 climate data for {cl['station']}, the closest comparable location in that data set ({cl['km']} km away)"


def climate_sentence(c):
    cl = c['climate']
    return (f"{c['name']} gets about {n(cl['hdd'])} heating degree-days a year and has a winter design temperature of "
            f"{deg(cl['designHeat'])}, according to {climate_src_phrase(c)}.")


def hdd_context(c):
    k = HDD_RANK[c['slug']]
    if k <= 10:
        return f"That's the {ordinal(k)}-highest heating demand of the {NCITY} cities we cover" if k > 1 else f"That's the highest heating demand of the {NCITY} cities we cover"
    j = NCITY - k + 1
    if j <= 10:
        return f"That's the {ordinal(j)}-lowest heating demand of the {NCITY} cities we cover" if j > 1 else f"That's the lowest heating demand of the {NCITY} cities we cover"
    more = round(100 * (cl := c['climate']['hdd']) / MED_HDD - 100)
    if more > 3:
        return f"That's about {more}% more heating demand than the middle of the {NCITY} cities we cover"
    if more < -3:
        return f"That's about {abs(more)}% less heating demand than the middle of the {NCITY} cities we cover"
    return f"That's right around the middle of the {NCITY} cities we cover"


def housing_sentence(c):
    h = c['housing']
    return (f"Of {c['name']}'s {n(h['houses'])} houses (single-detached, semi-detached, row houses and duplexes), "
            f"{pct(h['housesPre1961Pct'])} were built before 1961 and {pct(h['housesPre1991Pct'])} before 1991, "
            f"according to the 2021 Census.")


def median_era(c):
    m = c['housing']['medianHousePeriod'] or ''
    return m.replace(' to ', '–').replace('or before', 'or earlier')


def heat_share(c, key):
    h = c.get('heating')
    if not h or not h.get(key):
        return None
    v = h[key]
    return ('about ' if v['caution'] else '') + f"{round(v['v'])}%"


def heating_area(c):
    h = c.get('heating')
    if not h:
        return None
    if h['isProvince']:
        return h['geo']
    g = h['geo']
    if 'Ontario part' in g:
        return 'the Ottawa (Ontario) part of the Ottawa–Gatineau region'
    if 'Quebec part' in g:
        return 'the Gatineau (Quebec) part of the Ottawa–Gatineau region'
    return f'the {g} area'


def heating_sentence(c, lead=True):
    h = c.get('heating')
    if not h:
        return None
    parts = []
    systems = [(k, lab) for k, lab in (('forcedAir', 'a forced-air furnace'), ('baseboard', 'electric baseboards'),
                                       ('heatPump', 'a heat pump'), ('boiler', 'a boiler and radiators')) if heat_share(c, k)]
    systems.sort(key=lambda kl: -h[kl[0]]['v'])  # biggest share first
    for key, label in systems:
        v = heat_share(c, key)
        parts.append(f'{v} of households heat mainly with {label}' if not parts else f'{v} with {label}')
    fuels = []
    for key, label in (('gas', 'natural gas'), ('electricity', 'electricity'), ('oil', 'oil'), ('wood', 'wood'), ('propane', 'propane')):
        v = heat_share(c, key)
        if v:
            fuels.append((key, label, v))
    fuels.sort(key=lambda f: -h[f[0]]['v'])  # biggest share first
    fuel_bits = [f'{lab} is the main heating energy for {v} of households' if i == 0 else f'{lab} for {v}'
                 for i, (_, lab, v) in enumerate(fuels[:3])]
    s = ''
    if parts:
        s = f"In {heating_area(c)}, {join_and(parts)}"
    if fuel_bits:
        s = (s + f"; {join_and(fuel_bits)}") if s else f"In {heating_area(c)}, {join_and(fuel_bits)}"
    return (s + ' (Statistics Canada, 2023).') if s else None


def clip(text, n):
    """Shorten to whole sentences within n characters (never mid-word); fall back to a word boundary with an ellipsis."""
    text = (text or '').strip()
    if len(text) <= n:
        return text
    cut = text[:n]
    ends = [m.end() for m in re.finditer(r'[.!?](?=\s)', cut)]
    if ends and ends[-1] >= n * 0.45:
        return cut[:ends[-1]].strip()
    return cut.rsplit(' ', 1)[0].rstrip(',;:–— ') + '…'


def join_and(items):
    items = [i for i in items if i]
    if len(items) <= 1:
        return ''.join(items)
    return ', '.join(items[:-1]) + ' and ' + items[-1]


def gas_util(c):
    u = c.get('utilities') or {}
    return u.get('naturalGas')


def elec_util(c):
    u = c.get('utilities') or {}
    return u.get('electricity')


def radon_2012(c):
    r = c['radon']
    return r


def radon_newer(c):
    """Best 2024 survey figure for the city: city/CD first, then metro, then province."""
    best = None
    for e in c['radon'].get('newer', []):
        if e.get('figure') is None:
            continue
        sc = e.get('scope', '')
        rankv = 0 if sc.startswith('census division') or sc.startswith('city') else 1 if sc.startswith('CMA') or 'metro' in sc.lower() or sc.startswith('census metropolitan') else 2
        if best is None or rankv < best[0]:
            best = (rankv, e)
    if best:
        return best[1]
    pv = PROVS[c['prov']].get('radonNewer')
    return pv if (pv and pv.get('figure') is not None) else None


def wells_status(c):
    w = c.get('wells') or {}
    return w.get('wells')


# ------------------------------------------------------------------ provider notes per service
NRCAN_SERVICES = {'home-energy-audit', 'blower-door-test', 'thermal-imaging', 'heat-loss-calculation', 'duct-leakage-testing',
                  'combustion-safety-test', 'ventilation-assessment', 'attic-insulation-inspection', 'energy-bill-analysis'}

PROVIDER_NOTE = {
    'home-energy-audit': "Every organization below is licensed by NRCan to deliver EnerGuide evaluations and lists {city} postal codes. Coverage is the share of {city}'s urban postal areas each one lists.",
    'blower-door-test': "A blower door test is part of every EnerGuide evaluation, so any organization below can do one in {city}. Ask to walk the house with the advisor while the fan runs.",
    'thermal-imaging': "Most EnerGuide advisors bring an infrared camera, but it isn't a required part of the evaluation, so confirm when you book. The scan is most useful with the blower door running.",
    'heat-loss-calculation': "Many energy advisors also do room-by-room CSA F280 calculations for an extra fee; HVAC designers do them too. Ask for the F280 report itself, not just an equipment recommendation.",
    'duct-leakage-testing': "Duct leakage testing isn't part of a standard EnerGuide evaluation. Some of these organizations offer it, as do HVAC contractors with duct-testing equipment, so ask when you call.",
    'combustion-safety-test': "Energy advisors check for combustion spillage during an evaluation; fixing a venting problem is work for a licensed gas or oil technician.",
    'ventilation-assessment': "Advisors assess ventilation and humidity as part of an evaluation and check that exhaust fans actually vent outside. Sizing an HRV or ERV may be extra.",
    'attic-insulation-inspection': "Every EnerGuide evaluation includes an attic inspection: insulation depth, air leaks and red flags such as vermiculite or knob-and-tube wiring.",
    'energy-bill-analysis': "Bring 12 months of bills to any of these organizations' evaluations; the advisor's model uses them as the baseline for projected savings.",
}

# ------------------------------------------------------------------ service definitions
SERVICES = [
    dict(slug='home-energy-audit', name='Home energy audit', h1='Home energy audits', cat='energy', icon='home',
         guide='/articles/what-is-a-home-energy-audit/', guideLabel='What a home energy audit involves',
         blurb='An EnerGuide evaluation by an NRCan-registered energy advisor: blower door test, full house inspection, an energy rating and a ranked upgrade list.',
         cost='Varies by province'),
    dict(slug='blower-door-test', name='Blower door test', h1='Blower door testing', cat='energy', icon='wind',
         guide='/tests/blower-door/', guideLabel='The blower door test, step by step',
         blurb='A calibrated fan depressurizes the house to measure air leakage and show where the leaks are.',
         cost='Included in an EnerGuide evaluation'),
    dict(slug='thermal-imaging', name='Thermal imaging inspection', h1='Thermal imaging inspections', cat='energy', icon='camera',
         guide='/tests/thermal-imaging/', guideLabel='How an infrared scan works',
         blurb='An infrared camera maps cold and warm surfaces to find missing insulation, thermal bridges and hidden moisture.',
         cost='Usually included with an evaluation; confirm'),
    dict(slug='heat-loss-calculation', name='Heat loss calculation', h1='Heat loss calculations', cat='energy', icon='gauge',
         guide='/tests/heat-loss-calc/', guideLabel='The CSA F280 heat-loss calculation',
         blurb='A room-by-room CSA F280 calculation of heat loss at the local design temperature: the right way to size a heat pump or furnace.',
         cost='About $150–$400 standalone'),
    dict(slug='duct-leakage-testing', name='Duct leakage testing', h1='Duct leakage testing', cat='energy', icon='duct',
         guide='/tests/duct-leakage/', guideLabel='Duct leakage and airflow testing',
         blurb='Pressure-tests ductwork and measures airflow at each register to find where heated air disappears.',
         cost='About $200–$450'),
    dict(slug='combustion-safety-test', name='Combustion safety test', h1='Combustion safety testing', cat='energy', icon='flame',
         guide='/tests/combustion-safety/', guideLabel='The combustion safety and spillage check',
         blurb='Checks that furnaces, water heaters and fireplaces vent safely, especially before a house is tightened.',
         cost='Included with an evaluation when you have fuel-burning appliances'),
    dict(slug='ventilation-assessment', name='Ventilation and humidity assessment', h1='Ventilation and humidity assessments', cat='energy', icon='fan',
         guide='/tests/ventilation-assessment/', guideLabel='The ventilation and humidity assessment',
         blurb='Measures air exchange and humidity and checks that bath and kitchen fans actually move air outside.',
         cost='Included in an evaluation; HRV sizing may be extra'),
    dict(slug='attic-insulation-inspection', name='Attic insulation inspection', h1='Attic insulation inspections', cat='energy', icon='attic',
         guide='/tests/attic-inspection/', guideLabel='What an attic inspection checks',
         blurb='Insulation depth and condition, air bypasses and ventilation, plus red flags like vermiculite before anyone disturbs it.',
         cost='Included in an EnerGuide evaluation'),
    dict(slug='energy-bill-analysis', name='Energy bill analysis', h1='Energy bill analysis', cat='energy', icon='chart',
         guide='/tests/bill-analysis/', guideLabel='The 12-month bill analysis',
         blurb='Twelve months of electricity and gas use, weather-normalized and split into heating and baseload: the baseline every savings estimate needs.',
         cost='Free to do yourself; part of an evaluation'),
    dict(slug='radon-testing', name='Radon testing', h1='Radon testing', cat='health', icon='radon',
         guide='/tests/radon/', guideLabel='The radon testing guide',
         blurb="A long-term test (at least three months, in the heating season) measures radon against Canada's 200 Bq/m³ guideline.",
         cost='$30–$60 for a DIY long-term kit'),
    dict(slug='carbon-monoxide-testing', name='Carbon monoxide testing', h1='Carbon monoxide testing', cat='health', icon='co',
         guide='/tests/carbon-monoxide/', guideLabel='The carbon monoxide guide',
         blurb='CO alarms in the right places, plus a check that fuel-burning appliances vent safely.',
         cost='$40–$80 per alarm'),
    dict(slug='mold-testing', name='Mold and air quality testing', h1='Mold and air quality testing', cat='health', icon='mold',
         guide='/tests/mold-iaq/', guideLabel='The mold and indoor air quality guide',
         blurb='Air or surface sampling when you suspect hidden mold, paired with a hunt for the moisture that feeds it.',
         cost='About $300–$600 for a sampling visit'),
    dict(slug='asbestos-testing', name='Asbestos and vermiculite testing', h1='Asbestos and vermiculite testing', cat='health', icon='asbestos',
         guide='/tests/asbestos-vermiculite/', guideLabel='The asbestos and vermiculite guide',
         blurb='Lab analysis of samples from suspect insulation, tiles, plaster or duct wrap before renovation disturbs them.',
         cost='About $50–$150 per lab sample'),
    dict(slug='lead-paint-testing', name='Lead paint testing', h1='Lead paint testing', cat='health', icon='paint',
         guide='/tests/lead-paint/', guideLabel='The lead paint guide',
         blurb='Swab kits screen painted surfaces; a lab or an X-ray reading confirms before renovation disturbs old paint.',
         cost='$15–$40 for swab kits'),
    dict(slug='well-water-testing', name='Well water testing', h1='Well water testing', cat='health', icon='water',
         guide='/tests/well-water/', guideLabel='The well water guide',
         blurb='Bacteria testing at least once a year and periodic chemistry for homes on private wells.',
         cost='Varies by province'),
    dict(slug='commercial-energy-audit', name='Commercial energy audit', h1='Commercial energy audits', cat='commercial', icon='building',
         guide='/articles/commercial-energy-audits-ontario/', guideLabel='How commercial energy audits work',
         blurb='An engineering audit of an office, apartment, retail or industrial building, scoped to ASHRAE Standard 211 levels 1 to 3.',
         cost='Priced by building size and audit level'),
]
SV = {s['slug']: s for s in SERVICES}


# ------------------------------------------------------------------ helpers for page assembly
def providers_block(c, svc):
    provs = c['providers']
    note = PROVIDER_NOTE.get(svc, '').format(city=c['name'])
    items = [{'name': x['name'], 'phone': x['phone'], 'coverage': x['coverage'],
              'profile': f"/providers/{x['profile']}/" if x['profile'] else None,
              'hrs': x['hrs'], 'gcc': x['gcc']} for x in provs]
    special = None
    if c['prov'] == 'NS' and not provs:
        special = ("In Nova Scotia, EnerGuide home energy assessments are booked through Efficiency Nova Scotia's Home Energy Assessment program, "
                   "which assigns one of its Delivery Agent Partners; NRCan's list shows no separate service organizations for Nova Scotia postal codes.")
    elif c['prov'] == 'QC':
        special = ("In Quebec, EnerGuide evaluations for existing homes run through the provincial Rénoclimat program; the organizations below are "
                   "the ones NRCan lists for " + c['name'] + " postal codes.")
    elif c['prov'] == 'YT':
        special = "In Yukon, the territorial government's Energy Branch is the licensed service organization and arranges assessments with local energy advisors."
    elif c['prov'] == 'NT':
        special = "In the Northwest Territories, the Arctic Energy Alliance, a non-profit, is the licensed service organization for Yellowknife."
    return {'heading': f'NRCan-licensed service organizations serving {c["name"]}', 'note': note, 'special': special,
            'items': items, 'count': len(items)}


def city_facts(c):
    """Short facts reused on hubs and in the page's local-snapshot panel."""
    h = c['housing']
    cl = c['climate']
    r = c['radon']
    return {
        'hdd': cl['hdd'], 'designHeat': cl['designHeat'], 'station': cl['station'], 'stationKm': cl['km'],
        'housesPre1961': h['housesPre1961Pct'], 'housesPre1991': h['housesPre1991Pct'], 'houses': h['houses'],
        'radonPct': r['pct'], 'radonRegion': r['region'], 'providers': len(c['providers']),
        'gas': gas_util(c), 'electricity': elec_util(c), 'wells': wells_status(c),
        # construction-era shares of houses (2021 Census, 98-10-0233) for the housing portrait graphic
        'era': {'pre1961': h['housesPre1961Pct'], 'y1961to1990': h['houses1961to1990Pct'],
                'y1991to2000': h['houses1991to2000Pct'], 'since2001': h['housesSince2001Pct']},
        'singleDetachedPct': h['singleDetachedPct'], 'medianPeriod': median_era(c),
    }


def snapshot(c, src):
    """The 'local snapshot' panel shown on every service page (compact facts with sources)."""
    src.add('hot2000')
    src.add('census')
    h = c['housing']
    cl = c['climate']
    items = [
        {'k': 'Heating degree-days', 'v': n(cl['hdd'])},
        {'k': 'Winter design temperature', 'v': deg(cl['designHeat'])},
        {'k': 'Houses built before 1961', 'v': pct(h['housesPre1961Pct'])},
        {'k': 'Houses built before 1991', 'v': pct(h['housesPre1991Pct'])},
    ]
    if elec_util(c):
        items.append({'k': 'Electricity distributor', 'v': elec_util(c)})
    if gas_util(c):
        items.append({'k': 'Natural gas distributor', 'v': gas_util(c)})
    return items


def related_links(c, svc):
    other = [{'href': f"/services/{s['slug']}/{c['slug']}/", 'label': f"{s['name']} in {c['name']}"}
             for s in SERVICES if s['slug'] != svc]
    nearby = [{'href': f"/services/{svc}/{x['slug']}/", 'label': f"{SV[svc]['name']} in {x['name']}", 'km': x['km']}
              for x in c['nearby'][:5]]
    return other, nearby


def page_base(c, svc):
    s = SV[svc]
    return {'service': svc, 'city': c['slug'], 'h1': f"{s['h1']} in {c['name']}",
            'kicker': f"{c['provName']} · {'Energy' if s['cat'] == 'energy' else 'Home health' if s['cat'] == 'health' else 'Buildings'}"}


def eval_price(c, src):
    t, u = PT[c['prov']]['evalPrice']
    src.add(f"{c['provName']} — EnerGuide evaluation price or rebate", u)
    return t, PT[c['prov']]['evalShort']


def municipal_eval_subsidies(c):
    return [m for m in c['municipal'] if m['type'] == 'evaluation-subsidy' and m['status'] in ('open', 'waitlist')]


# ================================================================== service generators
def gen_home_energy_audit(c, src):
    pg = page_base(c, 'home-energy-audit')
    k = len(c['providers'])
    h = c['housing']
    ev_text, ev_short = eval_price(c, src)
    subs = municipal_eval_subsidies(c)
    src.add('nrcan-so')
    if c['prov'] == 'NS' and k == 0:
        lede = (f"In Nova Scotia, EnerGuide home evaluations are booked through Efficiency Nova Scotia's Home Energy Assessment program. "
                f"Here's what one costs in {c['name']}, what it finds in {c['name']}'s housing, and which rebates it unlocks.")
    else:
        lede = (f"{k} NRCan-licensed service organization{'s' if k != 1 else ''} deliver{'s' if k == 1 else ''} EnerGuide home evaluations in {c['name']}. "
                f"Here's what one costs, what it tends to find in {c['name']} houses, and which {c['provName']} rebates it unlocks.")
    pg['title'] = f"Home energy audits in {c['name']}: EnerGuide evaluations, costs and rebates"
    who = ("booking through Efficiency Nova Scotia" if (k == 0 and c['prov'] == 'NS') else
           'one licensed organization' if k == 1 else f"{k} licensed organizations" if k else 'who to call')
    pg['description'] = (f"Book an EnerGuide home energy audit in {c['name']}: {who}, local prices, {c['provName']} rebates and what "
                         f"{pct(h['housesPre1991Pct'])} pre-1991 housing means for your upgrade list.")
    pg['lede'] = lede
    glance = [{'k': 'Licensed organizations', 'v': str(k) if k else 'Via Efficiency NS'},
              {'k': 'Typical cost', 'v': ev_short},
              {'k': 'Heating degree-days', 'v': n(c['climate']['hdd'])},
              {'k': 'Houses built before 1991', 'v': pct(h['housesPre1991Pct'])}]
    if subs:
        glance[1] = {'k': 'Local help', 'v': 'City subsidy available'}
    pg['glance'] = glance
    secs = []
    why = [p(housing_sentence(c), f"The typical {c['name']} house dates from {median_era(c)}, and an evaluation is how you find out what that means for yours: "
             "the blower door measures air leakage, the advisor inspects the attic, walls, basement, windows and heating system, and the report ranks upgrades by what they'd save.")]
    why.append(p(climate_sentence(c), hdd_context(c) + '.', "The more heating a climate needs, the more each fix is worth, which is why the evaluation's ranked list matters more in some cities than others."))
    hs = heating_sentence(c)
    if hs:
        why.append(p(hs, 'The heating system on the report shapes the recommendations: a forced-air furnace invites a ducted heat pump, electric baseboards a ductless one.'))
        src.add('heating')
    secs.append({'h2': f"What an evaluation finds in {c['name']} homes", 'html': ''.join(why)})
    cost = [p(ev_text)]
    if subs:
        cost.append(ul([f"<strong>{esc(m['name'])}</strong>: {esc(m['summary'])} {a(m['url'], 'Details')}" for m in subs]))
        for m in subs:
            src.add(m['name'], m['url'])
    if c['prov'] in ('ON', 'BC', 'AB', 'SK', 'MB', 'NL'):
        cost.append(p("Most providers quote the initial (pre-upgrade) and follow-up (post-upgrade) visits separately. Rebate programs that pay on measured improvement need both, so ask for the combined price."))
    secs.append({'h2': f"What it costs in {c['name']}", 'html': ''.join(cost)})
    steps = ul(["<strong>Initial evaluation, about 2–3 hours.</strong> The advisor measures and inspects the house and runs the blower door test.",
                "<strong>Report and EnerGuide rating.</strong> You get the home's energy rating in gigajoules per year and a list of recommended upgrades with estimated savings.",
                "<strong>Do the work.</strong> Most rebate programs only count upgrades done after the initial evaluation.",
                "<strong>Follow-up evaluation.</strong> A second visit measures the improvement, which is what most rebates pay on."])
    secs.append({'h2': 'How it works', 'html': steps + p(a(SV['home-energy-audit']['guide'], 'Read the full guide to home energy audits') + '.')})
    pg['sections'] = secs
    pg['providers'] = providers_block(c, 'home-energy-audit')
    pg['programs'] = {'heading': f'Rebates and financing an evaluation unlocks in {c["name"]}',
                      'items': programs_for(c, need_audit=True) + municipal_for(c, ('loan', 'evaluation-subsidy', 'rebate-topup'))}
    faq = [
        {'q': f'How much does a home energy audit cost in {c["name"]}?', 'a': strip(ev_text) + (' ' + f"{c['name']} also has a municipal evaluation subsidy for eligible homeowners." if subs else '')},
        {'q': f'How many companies do EnerGuide evaluations in {c["name"]}?',
         'a': (f"NRCan's list of service organizations shows {k} licensed organization{'s' if k != 1 else ''} with {c['name']} postal codes (checked September 25, 2026)."
               if k else "NRCan's list shows no separate service organizations for Nova Scotia; assessments are booked through Efficiency Nova Scotia's Home Energy Assessment program.")},
        {'q': 'How long does an EnerGuide evaluation take?', 'a': 'The initial visit usually takes two to three hours, including the blower door test. The follow-up visit after upgrades is shorter.'},
    ]
    progs = programs_for(c, need_audit=True)
    if progs:
        faq.append({'q': f'Which rebates need an EnerGuide evaluation in {c["provName"]}?',
                    'a': 'Currently: ' + '; '.join(f"{x['name']} ({x['summary']})" for x in progs[:3]) + '. Check the program page for current terms before you book.'})
    pg['faq'] = faq
    return pg


def strip(t):
    import re
    return re.sub(r'<[^>]+>', '', t)


def gen_blower_door(c, src):
    pg = page_base(c, 'blower-door-test')
    k = len(c['providers'])
    h = c['housing']
    cl = c['climate']
    ev_text, ev_short = eval_price(c, src)
    pg['title'] = f"Blower door test in {c['name']}: cost, who does it and why it matters here"
    pg['description'] = (f"Where to get a blower door test in {c['name']}, what it costs, and why air leakage matters with "
                         f"{n(cl['hdd'])} heating degree-days a year and {pct(h['housesPre1961Pct'])} of houses built before 1961.")
    pg['lede'] = (f"A blower door test measures how leaky a house is and shows where the leaks are. In {c['name']}, with about "
                  f"{n(cl['hdd'])} heating degree-days a year, every leak runs up the heating bill for most of the year.")
    pg['glance'] = [{'k': 'Cost', 'v': 'Included in an evaluation'}, {'k': 'Evaluation price', 'v': ev_short},
                    {'k': 'Licensed organizations', 'v': str(k) if k else 'Via Efficiency NS'},
                    {'k': 'Houses built before 1961', 'v': pct(h['housesPre1961Pct'])}]
    secs = []
    secs.append({'h2': f"Why air leakage matters in {c['name']}", 'html': p(climate_sentence(c), hdd_context(c) + '.') +
                 p(housing_sentence(c), 'Older houses usually test leakier than newer ones, and an EnerGuide report compares your result with homes of the same era, so you can see whether your house is typical or a problem.')})
    after = []
    if heat_share(c, 'gas') or heat_share(c, 'oil'):
        fuel = join_and([x for x in [f"natural gas for {heat_share(c, 'gas')}" if heat_share(c, 'gas') else None,
                                     f"oil for {heat_share(c, 'oil')}" if heat_share(c, 'oil') else None]])
        after.append(f"<strong>Combustion safety.</strong> In {heating_area(c)}, the main heating energy is {fuel} of households. A tighter house changes how fuel-burning appliances vent, so the spillage check should be repeated after serious air sealing. " + a(f"/services/combustion-safety-test/{c['slug']}/", f"Combustion safety testing in {c['name']}"))
        src.add('heating')
    rn = radon_newer(c)
    after.append(f"<strong>Radon.</strong> Sealing shifts the pressure balance between the house and the soil. {radon_line(c, src)} Test before and after big air-sealing jobs. " + a(f"/services/radon-testing/{c['slug']}/", f"Radon testing in {c['name']}"))
    secs.append({'h2': 'After you seal: two checks', 'html': ul(after)})
    secs.append({'h2': f"What it costs in {c['name']}", 'html': p("A blower door test is part of every EnerGuide evaluation rather than a separate purchase.", ev_text)})
    secs.append({'h2': 'How the test works', 'html': ul([
        'A calibrated fan is fitted into an exterior door and pulls air out until the house is at 50 pascals, the standard test pressure.',
        'The result is air changes per hour at 50 Pa (ACH50): how many times an hour the whole volume of air would leak out and be replaced at that pressure.',
        'While the fan runs, you and the advisor walk the house and feel for leaks at the attic hatch, rim joists, pot lights, trim and plumbing and wiring penetrations.',
        'A second test after the work shows what changed, and it is what most rebates pay on.']) + p(a(SV['blower-door-test']['guide'], 'The blower door test in detail') + '.')})
    pg['sections'] = secs
    pg['providers'] = providers_block(c, 'blower-door-test')
    pg['programs'] = {'heading': f'Programs that include a blower door test in {c["name"]}', 'items': programs_for(c, need_audit=True) + municipal_for(c, ('loan', 'evaluation-subsidy'))}
    pg['faq'] = [
        {'q': f'Where can I get a blower door test in {c["name"]}?',
         'a': (f"Book an EnerGuide evaluation with any of the {k} NRCan-licensed organizations serving {c['name']}; the blower door test is part of every evaluation." if k else
               "Book Efficiency Nova Scotia's Home Energy Assessment; the blower door test is part of every assessment.")},
        {'q': f'How much does a blower door test cost in {c["name"]}?', 'a': 'It is included in an EnerGuide evaluation. ' + strip(ev_text)},
        {'q': 'What is a good blower door result?', 'a': 'Lower is better. Your EnerGuide report compares your air changes per hour at 50 Pa with homes of the same era, which is more useful than a single target number.'},
        {'q': 'Does air sealing affect radon?', 'a': 'It can. Tightening a house changes the pressure difference with the soil, so test for radon before and after major air sealing.'},
    ]
    return pg


def radon_line(c, src):
    r = c['radon']
    parts = []
    if r['pct'] is not None:
        src.add('radon2012')
        if r['pct'] == 0:
            parts.append(f"In Health Canada's 2012 survey, none of the {r['tested']} homes tested in the {r['region']} health region were above the guideline, a small sample that doesn't rule radon out.")
        else:
            parts.append(f"Health Canada's 2012 survey found {pct(r['pct'], 1)} of {r['tested']} homes tested in the {r['region']} health region above the guideline.")
    if c['slug'] in RADON_CITY_PROGRAM:
        prog = RADON_CITY_PROGRAM[c['slug']]
        src.add(prog['label'], prog['href'])
        parts.append(prog['sentence'])
        return ' '.join(parts)
    nw = radon_newer(c)
    if nw:
        src.add('radon2024')
        parts.append(f"The larger 2024 Cross-Canada survey reports {short_fig(nw['figure'])} for {scope_label(nw['scope'])}.")
    return ' '.join(parts)


# City test-kit programs reported in place of the 2024 survey (volunteer results, not random samples)
RADON_CITY_PROGRAM = {
    'st-johns': {
        'sentence': ("In the City of St. John's free test-kit program, about 345 kits went out in November 2024 and 278 homes completed testing over "
                     "the winter; about one in ten of them were above Health Canada's 200 Bq/m³ guideline. The participants were volunteers, so it isn't a random survey."),
        'tile': {'k': 'City kit program', 'v': 'About 1 in 10', 'sub': '278 homes tested, winter 2024–25'},
        'label': "City of St. John's — free radon test kits (results of the 2024–25 round)",
        'href': 'https://www.stjohns.ca/news/posts/free-radon-test-kits-return-for-2025-for-st-johns-residents/',
    },
}


def short_fig(f):
    f = f.split(';')[0]
    f = f.replace(' (weighted value)', '').replace(' (unweighted value)', '')
    f = f.replace('at or above 200 Bq/m3', 'at or above the guideline').replace('of residential buildings ', '')
    return f.strip()


def scope_label(sc):
    s = sc.split(':', 1)[1].strip() if ':' in sc else sc
    if sc.startswith('province'):
        return {'ON': 'Ontario', 'QC': 'Quebec', 'BC': 'B.C.', 'AB': 'Alberta', 'SK': 'Saskatchewan', 'MB': 'Manitoba',
                'NS': 'Nova Scotia', 'NB': 'New Brunswick', 'PE': 'PEI', 'NL': 'Newfoundland and Labrador', 'YT': 'Yukon',
                'NT': 'the Northwest Territories'}.get(s, s)
    if sc.startswith('CMA') or 'CMA' in sc:
        return f'the {s} metro area' if 'metro' not in s.lower() else s
    return s


def gen_thermal(c, src):
    pg = page_base(c, 'thermal-imaging')
    k = len(c['providers'])
    cl = c['climate']
    h = c['housing']
    ev_text, ev_short = eval_price(c, src)
    mild = cl['designHeat'] > -10
    pg['title'] = f"Thermal imaging home inspection in {c['name']}: when to book and who does it"
    pg['description'] = (f"Infrared (thermal) home inspections in {c['name']}: when {c['name']}'s weather gives a clear scan, what the camera finds in "
                         f"{'older' if h['housesPre1961Pct'] >= 25 else 'local'} houses, and the licensed advisors who bring one.")
    pg['lede'] = (f"An infrared camera shows missing insulation, air leaks and damp spots without opening a wall, but only when it's "
                  f"at least 10°C colder outside than inside. " +
                  (f"{c['name']}'s mild winters make timing the scan the main thing to plan." if mild else
                   f"{c['name']}'s long heating season gives you months of good scanning weather."))
    pg['glance'] = [{'k': 'Cost', 'v': 'Usually included; confirm'}, {'k': 'Best conditions', 'v': '≥10°C inside/outside difference'},
                    {'k': 'Winter design temperature', 'v': deg(cl['designHeat'])},
                    {'k': 'Houses built before 1961', 'v': pct(h['housesPre1961Pct'])}]
    secs = []
    if mild:
        timing = p(climate_sentence(c), f"With winters that mild, a 10°C difference isn't guaranteed every day, so book the scan for a cold morning or evening, and ask the advisor to reschedule if the forecast is too warm.")
    else:
        timing = p(climate_sentence(c), f"That gives {c['name']} a long window, roughly late fall to early spring, when the inside-outside difference comfortably exceeds the 10°C an infrared scan needs.")
    secs.append({'h2': f"When to book in {c['name']}", 'html': timing})
    secs.append({'h2': f"What the camera finds in {c['name']} houses", 'html': p(housing_sentence(c),
                 "Older houses are where the camera earns its keep: empty or settled wall cavities, gaps at the top of walls, and cold corners where framing bridges the insulation. "
                 "Run it with the blower door test depressurizing the house and every leak shows up as a cold streak.")})
    secs.append({'h2': 'What it costs', 'html': p("Most EnerGuide advisors include an infrared scan with the evaluation, but it isn't required, so confirm when you book.", ev_text)})
    pg['sections'] = secs
    pg['providers'] = providers_block(c, 'thermal-imaging')
    muni_other = [m for m in c['municipal'] if 'thermal' in (m['name'] + m['summary']).lower() and m['status'] != 'closed']
    pg['programs'] = {'heading': f'Programs and local help in {c["name"]}', 'items': programs_for(c, need_audit=True) + [
        {'name': m['name'], 'href': m['url'], 'summary': m['summary'], 'status': m['status'], 'kind': 'Municipal'} for m in muni_other]}
    pg['faq'] = [
        {'q': f'When is the best time for a thermal imaging inspection in {c["name"]}?',
         'a': ('Pick a cold morning or evening in winter; the camera needs at least a 10°C difference between inside and outside, which isn\'t guaranteed every winter day in ' + c['name'] + '.') if mild else
              'Late fall through early spring, when it is at least 10°C colder outside than inside. Cold, overcast days with no direct sun on the walls give the clearest images.'},
        {'q': 'Can a thermal camera see through walls?', 'a': 'No. It reads surface temperatures. Missing insulation or an air leak shows up because it changes the temperature of the wall or ceiling surface.'},
        {'q': f'Who does thermal imaging in {c["name"]}?',
         'a': f"Most of the {k} NRCan-licensed organizations serving {c['name']} bring an infrared camera to an EnerGuide evaluation; confirm when you book." if k else "Ask when you book Efficiency Nova Scotia's Home Energy Assessment."},
    ]
    return pg


def gen_heat_loss(c, src):
    pg = page_base(c, 'heat-loss-calculation')
    cl = c['climate']
    k = len(c['providers'])
    dt = cl['designHeat']
    mild = dt > -10
    cold = dt <= -28
    pg['title'] = f"Heat loss calculation in {c['name']}: sizing a heat pump for {deg(dt)}"
    pg['description'] = (f"A CSA F280 room-by-room heat loss calculation for {c['name']} homes, sized to the local {deg(dt)} design temperature: "
                         f"why it matters for heat pumps, what it costs and who does it.")
    pg['lede'] = (f"The heat loss calculation is how a heat pump or furnace gets sized for your house, and the key input is the design temperature: "
                  f"{deg(dt)} for {c['name']}, from {climate_src_phrase(c)}.")
    pg['glance'] = [{'k': 'Design temperature', 'v': deg(dt)}, {'k': 'Heating degree-days', 'v': n(cl['hdd'])},
                    {'k': 'Standard', 'v': 'CSA F280'}, {'k': 'Typical cost', 'v': '$150–$400 standalone'}]
    secs = []
    colder = DT_RANK[c['slug']]
    rank_txt = (f"the {ordinal(colder)}-coldest design temperature of the {NCITY} cities we cover" if colder <= NCITY // 2
                else f"the {ordinal(NCITY - colder + 1)}-mildest design temperature of the {NCITY} cities we cover")
    body = [p(f"{deg(dt)} is {rank_txt}.", "The F280 calculation works out how much heat each room loses on that design day, from the house's actual walls, windows, air leakage and ceiling insulation.")]
    if mild:
        body.append(p(f"With a design day that mild, a heat pump sized to the calculation can carry most or all of a typical {c['name']} house's heating load, which makes sizing it right, rather than oversizing it, the main job."))
    elif cold:
        body.append(p(f"At {deg(dt)}, even cold-climate heat pumps lose capacity just when you need heat most. The room-by-room number tells you how much the heat pump can cover and how much backup heat to plan for, rather than guessing from square footage."))
    else:
        body.append(p(f"At {deg(dt)}, a cold-climate heat pump sized to the calculation can carry most of the season, and the number shows how much backup heat the coldest days need."))
    hs = heating_sentence(c)
    if hs:
        body.append(p(hs))
        src.add('heating')
    secs.append({'h2': f"Why the design temperature matters in {c['name']}", 'html': ''.join(body)})
    secs.append({'h2': 'Why skipping it costs money', 'html': p("Contractors who size by square footage routinely oversize. An oversized heat pump costs more to buy, cycles on and off, dehumidifies poorly in summer and wears faster. "
                                                              "An undersized one leans on backup heat. The F280 report is the evidence either way, and it's worth having before you compare quotes.")})
    secs.append({'h2': 'What it costs', 'html': p("About $150–$400 as a standalone calculation (a September 2026 planning range; quotes vary). Many energy advisors bundle it with an EnerGuide evaluation, which also gives the calculation measured air-leakage data instead of an assumption.")})
    pg['sections'] = secs
    pg['providers'] = providers_block(c, 'heat-loss-calculation')
    pg['programs'] = {'heading': f'Heat pump programs in {c["name"]}', 'items': programs_for(c) + municipal_for(c, ('loan', 'rebate-topup'))}
    pg['faq'] = [
        {'q': f'What design temperature is used for heat pump sizing in {c["name"]}?', 'a': f"NRCan's HOT2000 climate data gives {deg(dt)} for {cl['station']}{' (' + str(cl['km']) + ' km away)' if cl['km'] > 20 else ''}. Your designer may use the building code's design value for {c['name']}, which can differ slightly; ask which one the calculation uses."},
        {'q': 'How much does a heat loss calculation cost?', 'a': 'About $150–$400 standalone as a planning range; often less when bundled with an EnerGuide evaluation.'},
        {'q': f'Who does F280 calculations in {c["name"]}?', 'a': (f"Many of the {k} NRCan-licensed organizations serving {c['name']} offer them, as do HVAC designers. Ask for the F280 report itself." if k else 'Energy advisors and HVAC designers; ask for the F280 report itself.')},
        {'q': 'Do rebate programs require a heat loss calculation?', 'a': 'Requirements vary by program and change often. Even where it isn\'t required, it is the best protection against an oversized or undersized system.'},
    ]
    return pg


def gen_duct(c, src):
    pg = page_base(c, 'duct-leakage-testing')
    fa = heat_share(c, 'forcedAir')
    bb = heat_share(c, 'baseboard')
    h = c['housing']
    pg['title'] = f"Duct leakage testing in {c['name']}: cold rooms, costs and who tests"
    pg['description'] = (f"Duct leakage and airflow testing in {c['name']}: " + (f"{fa} of local households heat with a forced-air furnace, " if fa else '') +
                         "why far rooms stay cold, what a test costs and who does it.")
    fa_num = float(fa.replace('about ', '').rstrip('%')) if fa else 0
    if fa and fa_num >= 30:
        fa_line = f"In {heating_area(c)}, {fa} of households heat with a forced-air furnace, so duct losses affect many {c['name']} homes."
    elif fa:
        fa_line = (f"In {heating_area(c)}, only {fa} of households heat with a forced-air furnace, so the test matters mainly for homes with ducts "
                   f"or those adding a ducted heat pump.")
    else:
        fa_line = f"Duct testing matters in {c['name']} homes that have forced-air heating or a ducted heat pump."
    pg['lede'] = "If some rooms never get warm, the problem is often the ductwork, not the furnace. " + fa_line
    pg['glance'] = [{'k': 'Typical cost', 'v': '$200–$450'}, {'k': 'Forced-air furnaces', 'v': fa or 'Not published'},
                    {'k': 'Electric baseboards', 'v': bb or 'Not published'}, {'k': 'Houses built before 1991', 'v': pct(h['housesPre1991Pct'])}]
    body = []
    hs = heating_sentence(c)
    if hs:
        body.append(p(hs))
        src.add('heating')
    if bb and fa and float(bb.replace('about ', '').rstrip('%')) > float(fa.replace('about ', '').rstrip('%')):
        body.append(p(f"Electric baseboards outnumber furnaces here, and a baseboard-heated house has no ducts to test. The test matters if you have forced air, or before you add a ducted heat pump to existing ductwork."))
    body.append(p(housing_sentence(c), "Ducts in older houses often run through unheated spaces with taped or unsealed joints, and supply runs to the far rooms are the first to suffer."))
    pg['sections'] = [
        {'h2': f"Who needs it in {c['name']}", 'html': ''.join(body)},
        {'h2': 'What the test shows', 'html': ul(['Total duct leakage, as a share of the system\'s airflow, measured with a duct-pressurization fan.',
                                                  'Airflow at each register, which explains why one bedroom is always cold.',
                                                  'Whether sealing and balancing will fix comfort problems before you buy bigger equipment.']) + p(a(SV['duct-leakage-testing']['guide'], 'Duct leakage testing in detail') + '.')},
        {'h2': 'What it costs', 'html': p('About $200–$450 (a September 2026 planning range; quotes vary). It isn\'t part of a standard EnerGuide evaluation, so ask for it when you book if comfort is your main complaint.')},
    ]
    pg['providers'] = providers_block(c, 'duct-leakage-testing')
    pg['programs'] = {'heading': f'Programs in {c["name"]}', 'items': programs_for(c) + municipal_for(c, ('loan', 'rebate-topup'))}
    pg['faq'] = [
        {'q': f'How much does duct leakage testing cost in {c["name"]}?', 'a': 'Plan on about $200–$450. It is usually a separate service from an EnerGuide evaluation.'},
        {'q': 'Is duct cleaning the same thing?', 'a': 'No. Cleaning removes dust; it doesn\'t find or seal leaks. A leakage test measures where air is lost.'},
        {'q': 'Should I close vents in unused rooms?', 'a': 'Usually not. Closing registers raises duct pressure and can increase leakage elsewhere in the system.'},
    ]
    return pg


def gen_combustion(c, src):
    pg = page_base(c, 'combustion-safety-test')
    gas = heat_share(c, 'gas')
    oil = heat_share(c, 'oil')
    wood = heat_share(c, 'wood')
    co_req, co_text, co_url = PT[c['prov']]['co']
    src.add(f"{c['provName']} — carbon monoxide alarm rules", co_url)
    gu = gas_util(c)
    pg['title'] = f"Combustion safety testing in {c['name']}: spillage checks before you seal"
    pg['description'] = (f"Combustion spillage and venting checks for {c['name']} homes with gas, oil or wood appliances"
                         + (f" ({gas} of local households heat mainly with natural gas)" if gas else '') + ", and why they matter before air sealing.")
    fuel_bits = [x for x in [f"natural gas for {gas}" if gas else None, f"oil for {oil}" if oil else None, f"wood for {wood}" if wood else None] if x] if heating_area(c) else []
    pg['lede'] = ("A combustion safety test checks that your furnace, water heater and fireplace vent their exhaust outside instead of into the house, "
                  "which matters most right before and after you tighten the house up." +
                  (f" In {heating_area(c)}, the main heating energy is {join_and(fuel_bits)} of households." if fuel_bits else ''))
    pg['glance'] = [{'k': 'Cost', 'v': 'Included with an evaluation'}, {'k': 'Natural gas heat', 'v': gas or ('No piped gas' if not gu else 'Not published')},
                    {'k': 'Gas distributor', 'v': gu or 'No piped gas'}, {'k': 'CO alarms required (existing homes)', 'v': {True: 'Yes', False: 'No', None: 'None found'}[co_req]}]
    body = []
    hs = heating_sentence(c)
    if hs:
        body.append(p(hs))
        src.add('heating')
    if not gu:
        body.append(p(f"{c['name']} has no piped natural gas for homes, so combustion appliances here are mostly oil, propane or wood, and each needs its own venting check."))
    body.append(p(f"The risk rises after air sealing: a tighter house plus a strong exhaust fan or dryer can pull exhaust back down a chimney. "
                  f"That's why advisors test for spillage during an evaluation and why it should be repeated after serious tightening."))
    if c['slug'] in CITY_CO:
        src.add(f"City of {c['name']} — carbon monoxide alarms", CITY_CO[c['slug']][1])
    secs = [{'h2': f"Why it matters in {c['name']}", 'html': ''.join(body)},
            {'h2': f"The CO alarm rule in {c['provName']}", 'html': p(co_text) + (p(CITY_CO[c['slug']][0]) if c['slug'] in CITY_CO else '')},
            {'h2': 'What the check involves', 'html': ul(['Worst-case depressurization: exhaust fans and the dryer on, doors set to make the appliance room as negative as it gets.',
                                                          'A spillage and draft check at each appliance, with a CO reading.',
                                                          'A plan if anything fails: often a sealed-combustion appliance or a fix to the venting, done by a licensed gas or oil technician.']) + p(a(SV['combustion-safety-test']['guide'], 'The combustion safety check in detail') + '.')}]
    pg['sections'] = secs
    pg['providers'] = providers_block(c, 'combustion-safety-test')
    pg['programs'] = {'heading': f'Programs in {c["name"]}', 'items': programs_for(c, need_audit=True)}
    pg['faq'] = [
        {'q': f'Are CO alarms required in {c["name"]} homes?', 'a': co_text + (' ' + CITY_CO[c['slug']][0] if c['slug'] in CITY_CO else '')},
        {'q': 'Who does combustion safety testing?', 'a': 'Energy advisors check for spillage during an EnerGuide evaluation. Repairs to venting or appliances are done by a licensed gas or oil technician.'},
        {'q': 'I have CO alarms. Isn\'t that enough?', 'a': 'Alarms warn you once CO is already in the house. A spillage test finds a venting problem before it produces CO.'},
    ]
    return pg


def gen_ventilation(c, src):
    pg = page_base(c, 'ventilation-assessment')
    h = c['housing']
    cl = c['climate']
    coastal = cl['designHeat'] > -10
    pg['title'] = f"Ventilation and humidity assessment in {c['name']}: condensation, mold and HRVs"
    pg['description'] = (f"Why {c['name']} homes get window condensation and musty air, what a ventilation and humidity assessment measures, "
                         f"and when an HRV or ERV makes sense. {pct(h['housesSince2001Pct'])} of local houses were built since 2001.")
    pg['lede'] = (f"Condensation on windows, musty basements and stuffy bedrooms are ventilation and humidity problems, and they're easy to confuse with insulation problems. "
                  f"A ventilation assessment measures which one you have.")
    pg['glance'] = [{'k': 'Cost', 'v': 'Part of an evaluation'}, {'k': 'Houses built since 2001', 'v': pct(h['housesSince2001Pct'])},
                    {'k': 'Houses built before 1961', 'v': pct(h['housesPre1961Pct'])}, {'k': 'Winter design temperature', 'v': deg(cl['designHeat'])}]
    body = [p(climate_sentence(c),
              ("Mild, damp winters mean indoor humidity rarely has a chance to dry out on its own, so fans that actually vent outside matter." if coastal else
               f"On {c['name']}'s coldest days, window glass and poorly insulated corners get cold enough for condensation at humidity levels that feel normal indoors, so winter humidity needs to stay at the lower end of the comfortable range."))]
    body.append(p(housing_sentence(c), f"Newer houses ({pct(h['housesSince2001Pct'])} of {c['name']}'s were built since 2001) are tight and usually have an HRV or ERV that needs balancing and cleaning. "
                  "Older houses that get air-sealed can lose the accidental ventilation they used to rely on."))
    pg['sections'] = [{'h2': f"Why {c['name']} homes get humidity problems", 'html': ''.join(body)},
                      {'h2': 'What the assessment measures', 'html': ul(['Relative humidity in living areas and the basement.',
                                                                         'Actual airflow from bath and kitchen fans, and whether they vent outside rather than into the attic.',
                                                                         'How much fresh air the house gets, and whether an HRV or ERV is balanced.']) + p(a(SV['ventilation-assessment']['guide'], 'The ventilation and humidity assessment in detail') + '.')},
                      {'h2': 'Related tests in ' + c['name'], 'html': p(a(f"/services/mold-testing/{c['slug']}/", f"Mold and air quality testing in {c['name']}") + ' · ' +
                                                                        a(f"/services/radon-testing/{c['slug']}/", f"Radon testing in {c['name']}"))}]
    pg['providers'] = providers_block(c, 'ventilation-assessment')
    pg['programs'] = {'heading': f'Programs in {c["name"]}', 'items': programs_for(c, need_audit=True)}
    pg['faq'] = [
        {'q': 'HRV or ERV?', 'a': 'Both bring in fresh air and recover heat. An ERV also transfers some moisture, which helps keep very dry winter air from getting drier; an HRV suits houses that tend to run humid.'},
        {'q': 'Why did condensation appear after we got new windows?', 'a': 'Tighter windows cut accidental air leakage, so humidity builds up. The fix is usually controlled ventilation, not leakier windows.'},
        {'q': f'Is a ventilation assessment part of an EnerGuide evaluation in {c["name"]}?', 'a': 'Advisors assess ventilation and humidity during the evaluation; HRV or ERV sizing may be an extra service.'},
    ]
    return pg


def gen_attic(c, src):
    pg = page_base(c, 'attic-insulation-inspection')
    h = c['housing']
    cl = c['climate']
    pg['title'] = f"Attic insulation inspection in {c['name']}: depth, air leaks and vermiculite"
    pg['description'] = (f"What an attic inspection finds in {c['name']} houses ({pct(h['housesPre1991Pct'])} built before 1991), why insulation pays with "
                         f"{n(cl['hdd'])} heating degree-days, and the rebates for topping it up.")
    pg['lede'] = (f"The attic is usually the cheapest big energy fix in a house, and the inspection decides how to do it: how much insulation is there, "
                  f"where air leaks through the ceiling, and whether anything up there must not be disturbed.")
    pg['glance'] = [{'k': 'Cost', 'v': 'Included in an evaluation'}, {'k': 'Houses built before 1991', 'v': pct(h['housesPre1991Pct'])},
                    {'k': 'Heating degree-days', 'v': n(cl['hdd'])}, {'k': 'Common finding', 'v': 'R-10–20 vs R-50–60 target'}]
    body = [p(housing_sentence(c), "Attics in older houses commonly have a fraction of today's recommended insulation, and top-ups done over the years often buried air leaks instead of sealing them first."),
            p(climate_sentence(c), hdd_context(c) + '.', 'The colder the climate, the faster added attic insulation pays for itself.')]
    body.append(p("<strong>Vermiculite.</strong> Loose, pebbly, grey-brown or silver-gold insulation may contain asbestos. Health Canada's advice is not to disturb it; have it sampled before any attic work. " +
                  a(f"/services/asbestos-testing/{c['slug']}/", f"Asbestos and vermiculite testing in {c['name']}")))
    src.add('hc-vermiculite')
    pg['sections'] = [{'h2': f"What inspections find in {c['name']} attics", 'html': ''.join(body)},
                      {'h2': 'The right order for the work', 'html': ul(['Seal the air leaks first: top plates, pot lights, plumbing stacks, the hatch.',
                                                                          'Fix ventilation baffles so new insulation doesn\'t block soffit vents.',
                                                                          'Then top up the insulation. Burying unsealed leaks under new insulation wastes much of the benefit.']) + p(a(SV['attic-insulation-inspection']['guide'], 'What an attic inspection checks') + '.')}]
    pg['providers'] = providers_block(c, 'attic-insulation-inspection')
    pg['programs'] = {'heading': f'Insulation programs in {c["name"]}', 'items': programs_for(c) + municipal_for(c, ('loan', 'rebate-topup'))}
    pg['faq'] = [
        {'q': f'How much attic insulation should a {c["name"]} house have?', 'a': 'Advisors commonly target around R-50 to R-60 in attics. Your EnerGuide report gives the recommendation for your house.'},
        {'q': 'Can I top up the insulation myself?', 'a': 'Only after the air leaks are sealed and you\'ve confirmed there is no vermiculite. The inspection tells you both.'},
        {'q': 'Will more insulation stop ice dams?', 'a': 'Insulation helps, but ice dams are mostly caused by warm air leaking into the attic. Air sealing is the bigger fix.'},
    ]
    return pg


def gen_bills(c, src):
    pg = page_base(c, 'energy-bill-analysis')
    u = c.get('utilities') or {}
    el, gs = u.get('electricity'), u.get('naturalGas')
    for s_ in (u.get('sources') or [])[:2]:
        src.add(f"{c['name']} utility service areas", s_)
    pg['title'] = f"Energy bill analysis in {c['name']}: getting 12 months of usage from {el.split(' / ')[0] if el else 'your utility'}"
    pg['description'] = (f"How to pull 12 months of usage from {join_and([x for x in [el, gs] if x])} and turn it into a weather-normalized baseline for {c['name']}'s "
                         f"{n(c['climate']['hdd'])} heating degree-days.")
    pg['lede'] = (f"Your own bills are the most accurate starting point for any energy plan. In {c['name']}, that means "
                  f"{'electricity from ' + el if el else 'your electricity utility'}" + (f" and natural gas from {gs}" if gs else ' (there is no piped natural gas for homes)') + '.')
    pg['glance'] = [{'k': 'Electricity', 'v': el or 'n/a'}, {'k': 'Natural gas', 'v': gs or 'No piped gas'},
                    {'k': 'Heating degree-days', 'v': n(c['climate']['hdd'])}, {'k': 'Cost', 'v': 'Free to do yourself'}]
    items = []
    for name in [x.strip() for x in (el or '').split('/')] + ([gs] if gs else []):
        if not name:
            continue
        info = UTIL.get(name) or UTIL.get(name.replace(' Gas', ' Gas')) or next((v for k_, v in UTIL.items() if k_.startswith(name.split(' (')[0])), None)
        if info:
            txt = f"<strong>{esc(name)}:</strong> {esc(info['usageDownload'])}"
            if info.get('url'):
                txt += ' ' + a(info['url'], 'Link')
                src.add(f"{name} — usage history", info['url'])
            items.append(txt)
    notes = [x for x in [u.get('electricityNote'), u.get('gasNote')] if x]
    body = [p(f"Most of {c['name']} is served by {el}" + (f" for electricity and {gs} for natural gas." if gs else " for electricity; there is no piped natural gas for homes.") if el else '')]
    if c['prov'] == 'AB':
        body.append(p("Alberta is a retail market: the distributor owns the wires and pipes, but you may buy the energy itself from a retailer. Your usage history sits with whoever bills you."))
    if items:
        body.append(ul(items))
    pg['sections'] = [{'h2': f"Getting your usage history in {c['name']}", 'html': ''.join(body)},
                      {'h2': 'What the analysis shows', 'html': p(climate_sentence(c),
                       "Weather-normalizing your bills against those degree-days separates heating from baseload (lights, appliances, hot water), so you can see how much of the bill a heating upgrade can actually touch, and compare a mild year with a harsh one fairly.") +
                       p(a(SV['energy-bill-analysis']['guide'], 'How the 12-month bill analysis works') + '.')}]
    pg['providers'] = providers_block(c, 'energy-bill-analysis')
    pg['programs'] = {'heading': f'Programs in {c["name"]}', 'items': programs_for(c, need_audit=True)}
    src.add('hot2000')
    pg['faq'] = [
        {'q': f'How do I download my energy usage in {c["name"]}?', 'a': strip(' '.join(items)) if items else 'Log in to your utility account and look for usage history or a data download.'},
        {'q': 'What is Green Button?', 'a': 'A standard format for downloading your own energy data. Ontario electricity utilities have been required to offer Green Button Download My Data since November 1, 2023.'},
        {'q': 'Why weather-normalize bills?', 'a': 'A cold winter raises heating bills even if nothing about the house changed. Normalizing to heating degree-days lets you compare years fairly and measure real savings.'},
    ]
    return pg


def gen_radon(c, src):
    pg = page_base(c, 'radon-testing')
    r = c['radon']
    pt = PT[c['prov']]
    nw = radon_newer(c)
    src.add('hc-radon')
    src.add('cnrpp')
    fig12 = (f"{pct(r['pct'], 1)} of homes tested above the guideline" if r['pct'] else 'no homes above the guideline in a small sample') if r['pct'] is not None else None
    pg['title'] = f"Radon testing in {c['name']}: local levels, test kits and certified professionals"
    pg['description'] = (f"Radon in {c['name']}: Health Canada survey results for the {r['region']} region" + (f" ({pct(r['pct'], 1)} above the guideline)" if r['pct'] else '') +
                         ", how to test for 3+ months, where to get kits and C-NRPP professionals locally.")
    lede = f"Radon is invisible, has no smell, and is the second-leading cause of lung cancer in Canada. "
    if r['pct']:
        lede += f"In Health Canada's national survey, {pct(r['pct'], 1)} of homes tested in the {r['region']} health region were above the guideline, and the only way to know about your house is to test it."
    else:
        lede += "The only way to know about your house is to test it."
    pg['lede'] = lede
    g1 = ({'k': '2012 survey (health region)', 'v': pct(r['pct'], 1), 'sub': f"{r['tested']} homes" if r['tested'] else None}
          if r['pct'] is not None else {'k': 'Where to test', 'v': 'Lowest lived-in level'})
    if c['slug'] in RADON_CITY_PROGRAM:
        g2 = RADON_CITY_PROGRAM[c['slug']]['tile']
    else:
        g2 = ({'k': '2024 survey', 'v': short_pct(nw['figure']), 'sub': scope_label(nw['scope'])}
              if nw else {'k': 'Test length', 'v': '3+ months', 'sub': 'mostly in the heating season'})
    pg['glance'] = [g1, g2, {'k': 'Guideline', 'v': '200 Bq/m³'}, {'k': 'DIY long-term kit', 'v': '$30–$60'}]
    secs = []
    body = [p(radon_line(c, src))]
    if nw and r['pct'] is not None and c['slug'] not in RADON_CITY_PROGRAM:
        body.append(p("The two surveys aren't directly comparable: the 2024 study pooled about 69,000 volunteer tests and more of them were taken in basements, which partly explains its higher numbers. "
                      "Neither can tell you about a single house, because neighbouring homes can differ widely."))
    else:
        body.append(p("No survey can tell you about a single house, because neighbouring homes can differ widely. Testing is the only way to know."))
    secs.append({'h2': f"Radon in {c['name']}", 'html': ''.join(body)})
    secs.append({'h2': 'How to test properly', 'html': ul(["Use a long-term test of at least three months, with most of it in the heating season, which gives the most conservative result.",
                                                           "Place the detector in the lowest level you spend four or more hours a day in, away from drafts, and follow the kit's instructions.",
                                                           "If the result is above 200 Bq/m³, Health Canada recommends fixing it within a year, sooner if it's much higher."]) +
                 p(a(SV['radon-testing']['guide'], 'Our full radon testing guide') + '.')})
    help_ = [pt['radonKits'][0]]
    src.add(f"{c['provName']} — radon test kits and lending", pt['radonKits'][1])
    if c['slug'] in CITY_RADON_KITS:
        help_.append(CITY_RADON_KITS[c['slug']][0])
        src.add(f"{c['name']} — radon kit program", CITY_RADON_KITS[c['slug']][1])
    help_.append(f"For a professional measurement or mitigation, search the {a(SRC['cnrpp'][1], 'C-NRPP directory')} by your {c['name']} postal code; it lists certified measurement and mitigation professionals.")
    secs.append({'h2': f"Kits and professionals in {c['name']}", 'html': ul(help_)})
    rules = [pt['radonCode'][0]]
    src.add(f"{c['provName']} — radon in the building code", pt['radonCode'][1])
    if pt.get('radonHelp'):
        rules.append(pt['radonHelp'][0])
        hs = pt['radonHelp'][1]
        if isinstance(hs, list):
            for lab, url in hs:
                src.add(lab, url)
        else:
            src.add(f"{c['provName']} — radon mitigation help", hs)
    rules.append("If your level is high, mitigation (usually a sub-slab depressurization fan system installed by a C-NRPP-certified professional) typically costs $2,000–$4,000.")
    secs.append({'h2': f"Rules and help in {c['provName']}", 'html': ul(rules)})
    pg['sections'] = secs
    pg['providers'] = None
    pg['programs'] = None
    pg['faq'] = [
        {'q': f'Is radon a problem in {c["name"]}?', 'a': strip(radon_line(c, Sources())) + ' Any home can have high radon, so Health Canada recommends testing every home.'},
        {'q': 'How long should a radon test take?', 'a': 'At least three months, with most of it during the heating season. Short tests can\'t tell you your long-term average.'},
        {'q': f'Where can I get a radon test kit in {c["name"]}?', 'a': strip(pt['radonKits'][0]) + ' Hardware stores and lung associations also sell long-term kits for about $30–$60.'},
        {'q': 'What does radon mitigation cost?', 'a': 'Typically $2,000–$4,000 for a sub-slab depressurization system installed by a C-NRPP-certified professional.'},
    ]
    return pg


def short_pct(fig):
    import re
    m = re.match(r'\s*([0-9.]+%)', fig or '')
    if m:
        return m.group(1)
    m = re.search(r'(1 in \d)', fig or '')
    return m.group(1) if m else 'n/a'


def gen_co(c, src):
    pg = page_base(c, 'carbon-monoxide-testing')
    co_req, co_text, co_url = PT[c['prov']]['co']
    src.add(f"{c['provName']} — carbon monoxide alarm rules", co_url)
    gas = heat_share(c, 'gas')
    oil = heat_share(c, 'oil')
    wood = heat_share(c, 'wood')
    h = c['housing']
    gu = gas_util(c)
    req_label = {True: 'Required in existing homes', False: 'Not required in existing homes', None: 'No requirement found'}[co_req]
    if c['slug'] in CITY_CO:
        req_label = 'Required by city by-law'
    pg['title'] = f"Carbon monoxide testing in {c['name']}: the {c['provName']} alarm rules and appliance checks"
    pg['description'] = (f"CO safety for {c['name']} homes: what {c['provName']} law requires, " +
                         (f"why it matters with {gas} of households heating with natural gas, " if gas else '') + "where alarms go and how appliances get checked.")
    lede_rule = CITY_CO[c['slug']][0] if c['slug'] in CITY_CO else strip(co_text)
    pg['lede'] = f"Carbon monoxide is odourless and can kill. {lede_rule}"
    pg['glance'] = [{'k': 'CO alarm rule', 'v': req_label}, {'k': 'Natural gas heat', 'v': gas or ('No piped gas' if not gu else 'Not published')},
                    {'k': 'Single-detached share', 'v': pct(h['singleDetachedPct'])}, {'k': 'Alarm cost', 'v': '$40–$80 each'}]
    body = [p(co_text)]
    if c['slug'] in CITY_CO:
        body.append(p(CITY_CO[c['slug']][0]))
        src.add(f"City of {c['name']} — carbon monoxide alarms", CITY_CO[c['slug']][1])
    fuel_bits = [x for x in [f"natural gas for {gas}" if gas else None, f"oil for {oil}" if oil else None, f"wood for {wood}" if wood else None] if x] if heating_area(c) else []
    body2 = []
    if fuel_bits:
        body2.append(p(f"In {heating_area(c)}, the main heating energy is {join_and(fuel_bits)} of households (Statistics Canada, 2023). Any fuel-burning appliance, fireplace or attached garage is a potential CO source."))
        src.add('heating')
    if not gu:
        body2.append(p(f"There's no piped natural gas for homes in {c['name']}, so the usual CO sources are oil furnaces, propane appliances, wood stoves and attached garages."))
    body2.append(p(f"Single-detached houses make up {pct(h['singleDetachedPct'])} of {c['name']}'s households; many have an attached garage, another reason to put an alarm near the door into the house."))
    pg['sections'] = [{'h2': f"The rule in {c['provName']}", 'html': ''.join(body)},
                      {'h2': f"CO sources in {c['name']} homes", 'html': ''.join(body2)},
                      {'h2': 'What a CO check involves', 'html': ul(['Alarms next to sleeping areas and on every storey, tested monthly and replaced by their end-of-life date (usually 7 to 10 years).',
                                                                     'Annual service of fuel-burning appliances by a licensed technician.',
                                                                     'A combustion spillage test during an energy evaluation, which catches a venting problem before it produces CO.']) +
                       p(a(SV['carbon-monoxide-testing']['guide'], 'Our carbon monoxide guide') + ' · ' + a(f"/services/combustion-safety-test/{c['slug']}/", f"Combustion safety testing in {c['name']}"))}]
    pg['providers'] = None
    pg['programs'] = None
    pg['faq'] = [
        {'q': f'Are carbon monoxide alarms mandatory in {c["name"]}?', 'a': strip(co_text) + (' ' + CITY_CO[c['slug']][0] if c['slug'] in CITY_CO else '')},
        {'q': 'Where should CO alarms go?', 'a': 'Outside every sleeping area and on every storey, following the manufacturer\'s instructions. Some rules also call for one near a fuel-burning appliance or the door from an attached garage.'},
        {'q': 'How long do CO alarms last?', 'a': 'Most have an end-of-life date of 7 to 10 years printed on the unit; replace them by then even if they still beep when tested.'},
    ]
    return pg


def gen_mold(c, src):
    pg = page_base(c, 'mold-testing')
    h = c['housing']
    cl = c['climate']
    coastal = cl['designHeat'] > -10 or c['prov'] in ('NS', 'NL', 'PE') and cl['designHeat'] > -20
    src.add('hc-mould')
    src.add('aihalap')
    pg['title'] = f"Mold testing in {c['name']}: air quality sampling and finding the moisture source"
    pg['description'] = (f"Mold and indoor air quality testing in {c['name']}: when sampling is worth $300–$600, why {'damp coastal' if coastal else 'cold'} "
                         f"winters cause condensation, and how to find an accredited lab.")
    pg['lede'] = ("Mold sampling tells you whether there's a hidden mold problem and roughly where. It doesn't tell you why, and fixing the moisture source is the actual cure.")
    pg['glance'] = [{'k': 'Typical sampling visit', 'v': '$300–$600'}, {'k': 'Houses built before 1991', 'v': pct(h['housesPre1991Pct'])},
                    {'k': 'Winter design temperature', 'v': deg(cl['designHeat'])}, {'k': 'Lab accreditation', 'v': 'AIHA EMLAP'}]
    body = [p(climate_sentence(c),
              ("Mild, wet winters keep materials damp, so poorly vented bathrooms, basements and crawlspaces are the usual suspects." if coastal else
               f"On cold days, exterior corners, closets on outside walls and window frames get cold enough for condensation, which is where mold usually starts in {c['name']} houses."))]
    body.append(p(housing_sentence(c), "Older basements without a moisture barrier and houses that were air-sealed without adding ventilation are common trouble spots."))
    prov_note = ''
    if c['prov'] == 'QC':
        prov_note = p("Quebec has a voluntary standard for handling mould in homes (BNQ 3009-600, 2020); no province has a mandatory residential mould standard.")
    else:
        prov_note = p("No Canadian province has a mandatory mould standard for homes. Health Canada's guideline sets no numerical limit: it says to fix moisture problems and clean up visible mould.")
    pg['sections'] = [{'h2': f"Why mold shows up in {c['name']} homes", 'html': ''.join(body)},
                      {'h2': 'When sampling is worth it', 'html': ul(['You smell mustiness but can\'t find the source.',
                                                                      'After a leak or flood, to check that cleanup worked.',
                                                                      'Before buying an older house with signs of past water damage.']) +
                       p('If you can see mould, you usually don\'t need a test to know it\'s there; you need to fix the moisture and clean it up properly.') + prov_note},
                      {'h2': 'Choosing a tester and lab', 'html': p(f"Ask any {c['name']} tester which lab analyzes their samples, and look for one accredited under AIHA's EMLAP program for environmental microbiology. "
                                                                   "Pair sampling with a ventilation and humidity assessment, which finds the cause.") +
                       p(a(f"/services/ventilation-assessment/{c['slug']}/", f"Ventilation and humidity assessments in {c['name']}") + ' · ' + a(SV['mold-testing']['guide'], 'Our mold and indoor air quality guide'))}]
    pg['providers'] = None
    pg['programs'] = None
    pg['faq'] = [
        {'q': f'How much does mold testing cost in {c["name"]}?', 'a': 'Plan on about $300–$600 for a typical sampling visit (a September 2026 planning range); lab fees for extra samples add to that.'},
        {'q': 'Do I need a test if I can see mould?', 'a': 'Usually not. Visible mould needs cleanup and a fix for the moisture source. Testing helps most when you suspect mould you can\'t see.'},
        {'q': 'Is there a legal mould limit for homes in Canada?', 'a': 'No. Health Canada sets no numerical limit; its guidance is to control moisture and clean up mould. Quebec has a voluntary handling standard.'},
    ]
    return pg


def gen_asbestos(c, src):
    pg = page_base(c, 'asbestos-testing')
    h = c['housing']
    t, u = PT[c['prov']]['asb']
    src.add(f"{c['provName']} — asbestos rules", u)
    src.add('hc-vermiculite')
    src.add('nvlap')
    pre91 = h['housesPre1991Pct']
    n91 = round(h['houses'] * pre91 / 100) if pre91 else None
    pg['title'] = f"Asbestos testing in {c['name']}: vermiculite, labs and the {c['provName']} rules"
    pg['description'] = (f"Asbestos and vermiculite testing in {c['name']}, where {pct(pre91)} of houses were built before 1991: what to sample, lab costs "
                         f"and the {c['provName']} rules for renovation.")
    pg['lede'] = (f"About {n(round(n91, -2)) if n91 else 'many'} {c['name']} houses ({pct(pre91)}) were built before 1991, when asbestos still turned up in "
                  "insulation, flooring, plaster and duct wrap. A lab test before renovation is the only way to know.")
    pg['glance'] = [{'k': 'Houses built before 1991', 'v': pct(pre91)}, {'k': 'Lab sample', 'v': '$50–$150'},
                    {'k': 'Houses built before 1961', 'v': pct(h['housesPre1961Pct'])}, {'k': 'Vermiculite', 'v': "Don't disturb it"}]
    pg['sections'] = [
        {'h2': f"Where asbestos shows up in {c['name']} houses", 'html': p(housing_sentence(c)) +
         ul(['Vermiculite attic insulation: loose, pebbly, grey-brown or silver-gold granules.',
             'Vinyl floor tiles and their adhesive, textured ceilings and some plaster.',
             'Duct wrap and pipe insulation on older heating systems.'])},
        {'h2': f"The rules in {c['provName']}", 'html': p(t) + p("Whatever the rules, don't sand, cut or remove suspect material yourself before it's tested.")},
        {'h2': 'Testing and labs', 'html': p("A trained assessor takes small samples, and an accredited lab analyzes them; plan on about $50–$150 per sample. "
                                             "Asbestos labs in Canada are typically accredited under NIST's NVLAP program" + (" or recognized by the IRSST in Quebec" if c['prov'] == 'QC' else '') + '.') +
         p(a(SV['asbestos-testing']['guide'], 'Our asbestos and vermiculite guide') + ' · ' + a(f"/services/attic-insulation-inspection/{c['slug']}/", f"Attic inspections in {c['name']}"))},
    ]
    pg['providers'] = None
    pg['programs'] = None
    pg['faq'] = [
        {'q': f'Do I need an asbestos test before renovating in {c["name"]}?', 'a': f"If the house was built before 1991 and the work will disturb insulation, flooring, plaster or duct wrap, test first. {strip(t)}"},
        {'q': 'How much does asbestos testing cost?', 'a': 'About $50–$150 per lab sample, plus the assessor\'s visit. Abatement, if needed, is quoted separately.'},
        {'q': 'What should I do if I have vermiculite in the attic?', 'a': 'Leave it alone, keep the attic closed, and have it sampled before any attic work. Health Canada advises against disturbing it or removing it yourself.'},
    ]
    return pg


def gen_lead(c, src):
    pg = page_base(c, 'lead-paint-testing')
    h = c['housing']
    src.add('hc-lead')
    src.add('aihalap')
    pre61 = h['housesPre1961Pct']
    mid = h['houses1961to1990Pct']
    pg['title'] = f"Lead paint testing in {c['name']}: which homes are at risk and how to test"
    pg['description'] = (f"{pct(pre61)} of {c['name']}'s houses were built before 1961, when lead paint was common. How to test with $15–$40 swabs or a lab, "
                         "and how to renovate safely.")
    pg['lede'] = (f"Health Canada says a home built before 1960 probably has lead paint somewhere. That's {pct(pre61)} of {c['name']}'s houses "
                  f"(built before 1961, per the 2021 Census), plus exterior paint on many of the {pct(mid)} built from 1961 to 1990.")
    pg['glance'] = [{'k': 'Houses built before 1961', 'v': pct(pre61)}, {'k': 'Built 1961–1990', 'v': pct(mid)},
                    {'k': 'Swab kits', 'v': '$15–$40'}, {'k': 'Lab accreditation', 'v': 'AIHA ELLAP'}]
    pg['sections'] = [
        {'h2': f"Which {c['name']} homes are at risk", 'html': p(housing_sentence(c)) +
         ul(['Built before 1960: probably has lead-based paint (Health Canada).',
             'Built 1960–1990: exterior paint may contain lead, and interior paint may contain smaller amounts.',
             'Built after 1990: consumer paints were virtually lead-free by then.'])},
        {'h2': 'How to test', 'html': ul(['Swab kits ($15–$40) give a quick screen of the surfaces you plan to disturb.',
                                          'For certainty, send paint chips to a lab accredited under AIHA\'s ELLAP program, or hire a firm with an X-ray fluorescence (XRF) analyzer.',
                                          'Test before sanding, stripping or replacing old windows and trim.']) +
         p(a(SV['lead-paint-testing']['guide'], 'Our lead paint guide') + '.')},
        {'h2': 'If it\'s positive', 'html': p("Don't dry-sand, use a heat gun or power-wash it. Contain the work area, mist surfaces, clean with a HEPA vacuum, and keep children and pregnant people away until cleanup is done. No province has a lead-paint rule aimed at homeowners, but contractors in B.C. and Yukon must include lead in pre-renovation or demolition hazard inspections.")},
    ]
    pg['providers'] = None
    pg['programs'] = None
    pg['faq'] = [
        {'q': f'Does my {c["name"]} house have lead paint?', 'a': 'If it was built before 1960, probably; 1960–1990, possibly on the exterior. Test the surfaces you plan to disturb.'},
        {'q': 'Are lead test swabs reliable?', 'a': 'They are a useful screen. For renovation decisions, confirm with a lab analysis of paint chips or an XRF reading.'},
        {'q': 'What does lead paint testing cost?', 'a': 'Swab kits run about $15–$40; lab analysis and XRF testing cost more and are quoted by the firm.'},
    ]
    return pg


def gen_wells(c, src):
    pg = page_base(c, 'well-water-testing')
    w = c.get('wells') or {}
    pt = PT[c['prov']]
    src.add(f"{c['provName']} — private well testing", pt['wells'][1])
    if w.get('source'):
        src.add(f"{c['name']} — private wells", w['source'])
    status = w.get('wells')
    label = {'common': 'Common', 'some': 'Some rural areas', 'rare': 'Rare'}.get(status, 'Unknown')
    pg['title'] = f"Well water testing in {c['name']}: how to test and what it costs in {c['provName']}"
    status_txt = {'common': 'many homes outside the piped areas use private wells',
                  'some': 'some rural areas rely on private wells',
                  'rare': 'most homes are on city water, but some rely on wells'}.get(status, 'some homes rely on private wells')
    pg['description'] = (f"Private well water testing in {c['name']}: {status_txt}. How {c['provName']}'s testing program works, "
                         f"what it costs and how often to test.")
    pg['lede'] = (w.get('sentence') or f"Some {c['name']} homes are on private wells.") + ' ' + ("If yours is, here's how testing works in " + c['provName'] + '.')
    pg['glance'] = [{'k': 'Private wells in ' + c['name'], 'v': label}, {'k': 'Testing cost', 'v': pt['wellCost']},
                    {'k': 'Test for', 'v': 'Bacteria yearly or more'}, {'k': 'Extended panels', 'v': 'Nitrate, metals, more'}]
    local = []
    if w.get('localProgram'):
        lp = w['localProgram']
        urls = re.findall(r'https?://[^\s)]+', lp)
        lp_txt = re.sub(r'\s*\(?https?://[^\s)]+\)?', '', lp).strip().rstrip('.') + '.'
        local.append(p('<strong>Local program:</strong> ' + esc(lp_txt) + (' ' + a(urls[0], 'Details') if urls else '')))
        if urls:
            src.add(f"{c['name']} — local well program", urls[0])
    pg['sections'] = [
        {'h2': f"Wells in {c['name']}", 'html': p(esc(w.get('sentence') or '')) + ''.join(local)},
        {'h2': f"How testing works in {c['provName']}", 'html': p(pt['wells'][0])},
        {'h2': 'What to test for', 'html': ul(['Bacteria (total coliforms and E. coli): at least once a year, and after flooding, heavy rain or work on the well.',
                                               'Nitrate, especially near farmland or septic systems.',
                                               'Metals and naturally occurring contaminants such as arsenic, uranium or manganese when a well is new and every few years after, depending on local geology.']) +
         p(a(SV['well-water-testing']['guide'], 'Our well water guide') + '.')},
    ]
    pg['providers'] = None
    pg['programs'] = None
    pg['faq'] = [
        {'q': f'Is well water testing free in {c["provName"]}?', 'a': strip(pt['wells'][0])},
        {'q': 'How often should I test my well?', 'a': 'For bacteria, at least once a year and after flooding, heavy rain or well work; many health units recommend more often. Test chemistry when the well is new and every few years after.'},
        {'q': f'Are private wells common in {c["name"]}?', 'a': w.get('sentence') or 'It depends on the neighbourhood; rural areas are more likely to rely on wells.'},
    ]
    return pg


def gen_commercial(c, src):
    pg = page_base(c, 'commercial-energy-audit')
    src.add('ashrae211')
    src.add('portfolio')
    rules = [r for r in (c['commercialRules'] or []) if r.get('status', 'in force') not in ('none', 'not found')]
    prov_rules = PROVS[c['prov']]['commercialRules'] or []
    inc = [INCENT[k] for k in c['commercialIncentives'] if k in INCENT and INCENT[k].get('status') != 'closed']
    mandatory = [r for r in rules + prov_rules if 'mandatory' in (r.get('type') or '') and 'none' not in (r.get('status') or '').lower()]
    pg['title'] = f"Commercial energy audits in {c['name']}: reporting rules and incentives"
    pg['description'] = (f"Commercial and multi-unit building energy audits in {c['name']}: ASHRAE levels, " +
                         (f"{len(mandatory)} reporting rule{'s' if len(mandatory) != 1 else ''} that apply, " if mandatory else 'no mandatory reporting rule, ') +
                         f"and {len(inc)} utility or government incentive{'s' if len(inc) != 1 else ''} for audits and studies.")
    pg['lede'] = (f"Offices, apartment buildings, retail and industrial sites get engineering energy audits rather than EnerGuide evaluations. "
                  f"Here's what applies in {c['name']}: " + (f"{len(mandatory)} mandatory reporting rule{'s' if len(mandatory) != 1 else ''}" if mandatory else 'no mandatory reporting rule') +
                  f" and {len(inc)} incentive program{'s' if len(inc) != 1 else ''} we found for audits and studies.")
    pg['glance'] = [{'k': 'Mandatory reporting', 'v': 'Yes' if mandatory else 'None found'}, {'k': 'Incentive programs', 'v': str(len(inc))},
                    {'k': 'Audit standard', 'v': 'ASHRAE 211, levels 1–3'}, {'k': 'Benchmarking tool', 'v': 'ENERGY STAR Portfolio Manager'}]
    rule_items = []
    for r in rules + prov_rules:
        st = (r.get('status') or '').lower()
        if 'none' in st and not r.get('summary'):
            continue
        if (r.get('name') or '').strip().lower().startswith('none'):
            continue
        txt = f"<strong>{esc(r['name'])}</strong>"
        if r.get('status'):
            txt += f" <span class=\"small\">({esc(r['status'])})</span>"
        if r.get('thresholds'):
            txt += f": {esc(r['thresholds'])}"
        elif r.get('summary'):
            txt += f": {esc(clip(r['summary'], 700))}"
        if r.get('source'):
            txt += ' ' + a(r['source'], 'Source')
            src.add(r['name'][:90], r['source'])
        rule_items.append(txt)
    inc_items = []
    for x in inc:
        txt = f"<strong>{esc(x['name'])}</strong> ({esc(x.get('provider', ''))}): {esc(clip(x['summary'], 700))}"
        if x.get('source'):
            txt += ' ' + a(x['source'], 'Details')
            src.add(x['name'][:90], x['source'])
        inc_items.append(txt)
    secs = [{'h2': f"Reporting rules that apply in {c['name']}", 'html': ul(rule_items) if rule_items else p(f"We found no mandatory energy reporting or benchmarking rule for {c['name']} buildings; ENERGY STAR Portfolio Manager is still the standard free tool for tracking a building.")},
            {'h2': 'Incentives for audits and studies', 'html': ul(inc_items) if inc_items else p(f"We found no current incentive that pays for commercial energy audits in {c['name']}." + (' ' + esc(c.get('commercialIncentiveNote') or '') if c.get('commercialIncentiveNote') else ''))},
            {'h2': 'Audit levels', 'html': ul(['<strong>Level 1, walk-through:</strong> a site visit and bill review that benchmarks the building and lists low-cost measures.',
                                               '<strong>Level 2, energy survey and analysis:</strong> where the energy goes, with savings and cost estimates per measure. Most incentive applications use this level.',
                                               '<strong>Level 3, detailed analysis:</strong> monitoring and modelling for capital-intensive projects.']) +
             p('Ask which level a quote covers. Audits are done by engineering firms and energy consultants; look for a P.Eng. and credentials such as the Certified Energy Manager (CEM). ' + a(SV['commercial-energy-audit']['guide'], 'How commercial energy audits work') + '.')}]
    pg['sections'] = secs
    pg['providers'] = None
    pg['programs'] = None
    pg['faq'] = [
        {'q': f'Do {c["name"]} buildings have to report energy use?', 'a': ('Yes, above certain sizes: ' + '; '.join(strip(r['name']) for r in mandatory[:3]) + '.') if mandatory else f"We found no mandatory reporting rule for {c['name']} buildings as of {CHECKED}."},
        {'q': f'Are there incentives for commercial energy audits in {c["name"]}?', 'a': ('Yes: ' + '; '.join(x['name'] for x in inc[:4]) + '. Check eligibility and pre-approval rules before you commission the audit.') if inc else 'We found no current incentive that pays for audits here.'},
        {'q': 'What does a commercial energy audit cost?', 'a': 'It depends on the building\'s size and the ASHRAE level. Get quotes that state the level and the deliverables.'},
    ]
    return pg


GENERATORS = {
    'home-energy-audit': gen_home_energy_audit, 'blower-door-test': gen_blower_door, 'thermal-imaging': gen_thermal,
    'heat-loss-calculation': gen_heat_loss, 'duct-leakage-testing': gen_duct, 'combustion-safety-test': gen_combustion,
    'ventilation-assessment': gen_ventilation, 'attic-insulation-inspection': gen_attic, 'energy-bill-analysis': gen_bills,
    'radon-testing': gen_radon, 'carbon-monoxide-testing': gen_co, 'mold-testing': gen_mold, 'asbestos-testing': gen_asbestos,
    'lead-paint-testing': gen_lead, 'well-water-testing': gen_wells, 'commercial-energy-audit': gen_commercial,
}


# ------------------------------------------------------------------ hub metric per service (for service hubs and city hubs)
def hub_metric(c, svc):
    h = c['housing']
    cl = c['climate']
    r = c['radon']
    if svc in ('home-energy-audit', 'blower-door-test', 'thermal-imaging', 'ventilation-assessment', 'attic-insulation-inspection', 'energy-bill-analysis', 'duct-leakage-testing', 'combustion-safety-test'):
        if svc == 'home-energy-audit':
            k = len(c['providers'])
            return f"{k} licensed organization{'s' if k != 1 else ''}" if k else 'Via Efficiency Nova Scotia'
        if svc == 'energy-bill-analysis':
            return elec_util(c) or ''
        if svc == 'duct-leakage-testing':
            fa = heat_share(c, 'forcedAir')
            return f"{fa} forced-air" if fa else f"{n(cl['hdd'])} degree-days"
        if svc == 'combustion-safety-test':
            g = heat_share(c, 'gas')
            return f"{g} heat with gas" if g else ('No piped gas' if not gas_util(c) else f"{n(cl['hdd'])} degree-days")
        if svc == 'attic-insulation-inspection':
            return f"{pct(h['housesPre1991Pct'])} built before 1991"
        if svc == 'ventilation-assessment':
            return f"{pct(h['housesSince2001Pct'])} built since 2001"
        return f"{n(cl['hdd'])} degree-days"
    if svc == 'heat-loss-calculation':
        return f"Design temp {deg(cl['designHeat'])}"
    if svc == 'radon-testing':
        if c['slug'] in RADON_CITY_PROGRAM:
            return 'About 1 in 10 high (city kit program)'
        nw = radon_newer(c)
        if nw and short_pct(nw['figure']) != 'n/a':
            return f"{short_pct(nw['figure'])} at or above guideline (2024)"
        return f"{pct(r['pct'], 1)} above guideline (2012)" if r['pct'] else 'Test every home'
    if svc == 'carbon-monoxide-testing':
        v = PT[c['prov']]['co'][0]
        if c['slug'] in CITY_CO:
            return 'Required by city by-law'
        return {True: 'Required by law', False: 'Not required (recommended)', None: 'No rule found'}[v]
    if svc == 'mold-testing':
        return f"{pct(h['housesPre1991Pct'])} built before 1991"
    if svc == 'asbestos-testing':
        return f"{pct(h['housesPre1991Pct'])} built before 1991"
    if svc == 'lead-paint-testing':
        return f"{pct(h['housesPre1961Pct'])} built before 1961"
    if svc == 'well-water-testing':
        return {'common': 'Wells common', 'some': 'Wells in some areas', 'rare': 'Wells rare'}.get(wells_status(c), '')
    if svc == 'commercial-energy-audit':
        k = len([x for x in c['commercialIncentives'] if x in INCENT and INCENT[x].get('status') != 'closed'])
        return f"{k} incentive program{'s' if k != 1 else ''}"
    return ''


def hub_provider_phrase(c):
    k = len(c['providers'])
    if k == 1:
        return 'one NRCan-licensed service organization lists its postal codes'
    if k:
        return f"{k} NRCan-licensed service organizations list its postal codes"
    if c['prov'] == 'NS':
        return "EnerGuide evaluations are booked through Efficiency Nova Scotia's Home Energy Assessment"
    return 'no NRCan-licensed service organization lists its postal codes yet'


# ------------------------------------------------------------------ build
def build():
    outdir = f'{REPO}/src/data/local'
    os.makedirs(f'{outdir}/cities', exist_ok=True)
    index_cities = []
    for c in CITIES:
        pages = {}
        for s in SERVICES:
            src = Sources()
            pg = GENERATORS[s['slug']](c, src)
            pg['snapshot'] = snapshot(c, src)
            other, nearby = related_links(c, s['slug'])
            pg['related'] = other
            pg['nearby'] = nearby
            src.add('pop')
            pg['sources'] = src.out()
            pages[s['slug']] = pg
        hub_src = Sources()
        facts = city_facts(c)
        hub = {
            'title': f"Home energy audits and home testing in {c['name']}: 16 local service guides",
            'description': (f"Local guides to 16 home energy and health services in {c['name']}, {c['provName']}: EnerGuide evaluations, radon, asbestos, "
                            f"heat pump sizing and more, with {n(c['climate']['hdd'])} degree-days and {pct(c['housing']['housesPre1991Pct'])} pre-1991 houses."),
            'lede': (f"{c['name']} gets about {n(c['climate']['hdd'])} heating degree-days a year, {pct(c['housing']['housesPre1961Pct'])} of its houses were built before 1961, "
                     f"and {hub_provider_phrase(c)}. Pick a service for the local details."),
            'climate': climate_sentence(c), 'housing': housing_sentence(c), 'heating': heating_sentence(c),
            'radon': radon_line(c, hub_src),
            'services': [{'slug': s['slug'], 'name': s['name'], 'cat': s['cat'], 'metric': hub_metric(c, s['slug'])} for s in SERVICES],
        }
        hub_src.add('hot2000')
        hub_src.add('census')
        hub_src.add('heating')
        hub_src.add('nrcan-so')
        hub['sources'] = hub_src.out()
        city_out = {
            'slug': c['slug'], 'name': c['name'], 'label': c['label'], 'prov': c['prov'], 'provName': c['provName'],
            'provSlug': c['provSlug'], 'population': c['population'], 'onRegion': c['onRegion'], 'facts': facts,
            'providers': c['providers'], 'nearby': c['nearby'], 'municipal': municipal_for(c), 'programs': programs_for(c),
            'hub': hub, 'pages': pages,
        }
        json.dump(city_out, open(f'{outdir}/cities/{c["slug"]}.json', 'w'), ensure_ascii=False, separators=(',', ':'))
        index_cities.append({'slug': c['slug'], 'name': c['name'], 'label': c['label'], 'prov': c['prov'], 'provName': c['provName'],
                             'provSlug': c['provSlug'], 'population': c['population'], 'facts': facts,
                             'metrics': {s['slug']: hub_metric(c, s['slug']) for s in SERVICES}})
    index = {'checked': CHECKED, 'checkedISO': CHECKED_ISO,
             'services': [{k: s[k] for k in ('slug', 'name', 'h1', 'cat', 'guide', 'guideLabel', 'blurb', 'cost')} for s in SERVICES],
             'cities': index_cities,
             'provinceOrder': ['BC', 'AB', 'SK', 'MB', 'ON', 'QC', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT']}
    json.dump(index, open(f'{outdir}/index.json', 'w'), ensure_ascii=False, indent=1)
    sizes = [os.path.getsize(f'{outdir}/cities/{c["slug"]}.json') for c in CITIES]
    print('cities', len(CITIES), 'pages', len(CITIES) * len(SERVICES), 'total KB', sum(sizes) // 1024, 'max KB', max(sizes) // 1024)


if __name__ == '__main__':
    build()
