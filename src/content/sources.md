# Sources and verification log

Every date, number and rule reference shown in the app or the PDF is listed here.
Status: **Verified** (checked against the primary source), **Supported** (secondary sources only; confirm the primary before relying on it in other materials), **Best practice** (not a rule requirement; the app says so), **[VERIFY]** (not yet checked).

Primary sources used (review of 2026-10-30):
- SEC Release No. 34-100155 (dated May 16, 2024), "Regulation S-P: Privacy of Consumer Financial Information and Safeguarding Customer Information". Final rule text of 17 CFR 248.30 and the amendment adding 17 CFR 275.204-2(a)(25). https://www.sec.gov/files/rules/final/2024/34-100155.pdf (rule text read from the release PDF; eCFR blocks automated access, so the current eCFR text was not opened).
- AdvisorDefense Incident Response Plan template, 2026, version 1.0 (`reference/Incident_Response_Plan_2026_XXXXXXXX.docx`, extracted to `reference/irp-template.md`). IRP citations quote or paraphrase that template.
- Reg S-P Readiness Score app source log (`reference/RegS-P-main/src/content/sources.md`, review of 2026-10-29) for contact details.

Rule citations refer to 17 CFR 248.30 as amended unless noted.

## Rule claims

| # | Claim as it appears | Where it appears | Source | Status |
|---|---|---|---|---|
| 1 | Notice as soon as practicable, no later than 30 days after becoming aware that unauthorized access to or use of customer information has occurred or is reasonably likely to have occurred | notice_deadline, detect_how_fast, notice_process | 248.30(a)(4)(iii) | Verified |
| 2 | Only the U.S. Attorney General can delay notice, by a written determination to the SEC (national security or public safety) | notice_ag_delay, contain_outside_contacts | 248.30(a)(4)(iii) | Verified |
| 3 | No notice only if, after a reasonable investigation, the firm determines sensitive customer information has not been and is not reasonably likely to be used in a manner that would result in substantial harm or inconvenience | notice_no_harm | 248.30(a)(3)(iii), (a)(4)(i) | Verified |
| 4 | Records advisers keep: (i) safeguards policies, (ii) incident documentation including response and recovery, (iii) notice determinations with basis, Attorney General documentation and copies of notices, (iv) service provider policies, (v) service provider contracts or agreements, (vi) disposal policies | records_determination, records_ready, recover_lessons | 275.204-2(a)(25)(i) to (vi) | Verified |
| 5 | Adviser records under 204-2(a) kept not less than five years, the first two in an easily accessible place | Not shown in the app (retention question held out). Used in discrepancies doc. | 275.204-2(e) as stated in Release 34-100155, recordkeeping table and note 2 | Verified (the release states it). The exact 204-2(e)(1) wording ("from the end of the fiscal year during which the last entry was made", "appropriate office") is [VERIFY] against eCFR. |
| 6 | Notice contents (A) to (H): incident and information type, date or range if known, contact information (toll-free phone if available, email, postal address, named office), review account statements, fraud alerts, credit reports, free credit report, FTC and usa.gov guidance and FTC website | notice_template help and finding | 248.30(a)(4)(iv) | Verified |
| 7 | If specific individuals cannot be identified, notify all individuals whose sensitive customer information resides in the affected system, unless the firm reasonably determines a specific individual's was not accessed | scope_data_map help and regsp_ref | 248.30(a)(4)(ii) | Verified ("generally" in the help covers the exception) |
| 8 | Response program reasonably designed to detect, respond to and recover; assess nature and scope and identify systems and types of information; contain and control | most knowledge questions (regsp_ref), section crosswalk | 248.30(a)(3), (a)(3)(i), (a)(3)(ii) | Verified |
| 9 | Service provider notice to the firm as soon as possible, no later than 72 hours after becoming aware of a breach resulting in unauthorized access to a customer information system the provider maintains | vendor_72_hours, vendor_diligence | 248.30(a)(5)(i)(B) | Verified |
| 10 | On receiving a provider's notice the firm must initiate its incident response program; receipt establishes awareness | vendor_breach_response, vendor_72_hours tie_in | 248.30(a)(5)(i)(B); Release 34-100155 footnote 259 | Verified |
| 11 | A provider may notify individuals for the firm under a written agreement, but the obligation stays with the firm | vendor_breach_response | 248.30(a)(5)(ii), (iii) | Verified |
| 12 | Oversight through due diligence and monitoring; service provider definition | vendor_diligence | 248.30(a)(5)(i), (d)(10) | Verified |
| 13 | Reg S-P does not require a written contract with service providers | vendor_diligence help | Release 34-100155, discussion of (a)(5) (written contract requirement not adopted); 248.30(a)(5) text has no contract requirement. IRP Section 2.7 says the same. | Verified |
| 14 | SOC 2 or similar reports can help but are not required; review should fit the vendor | vendor_diligence help | Release 34-100155 discussion of service provider oversight (carried from Reg S-P app item 21) | Verified in the Reg S-P app review of 2026-10-29; not re-opened in this review |
| 15 | Sensitive customer information definition and examples (account number or name combined with authenticating information such as date of birth) | scope_sensitive_info | 248.30(d)(9)(i), (ii)(B) | Verified |
| 16 | Firms generally should consider reviewing and updating response procedures periodically | roles_annual_review, roles_tabletop, recover_after_action | Release 34-100155, section II.A (assessment and containment discussions). No testing or tabletop requirement in the rule. | Best practice (help text says Reg S-P does not require a tabletop) |
| 17 | Release 34-100155 is dated May 16, 2024; effective August 2, 2024 | discrepancies doc item 6 | Release 34-100155, signature block and DATES | Verified |

## IRP claims

| # | Claim as it appears | Where it appears | IRP source | Status |
|---|---|---|---|---|
| 18 | Level 1: initial response within 60 minutes, CSIRT updates every hour | crit_level1_response (defaults in questions.json facts) | Section 2.4 table | Verified against template |
| 19 | Any CSIRT member may lead if both leads are unavailable; documented in the incident log | roles_lead_unavailable | Appendix D | Verified against template |
| 20 | RETIRED 2026-11-02: AdvisorDefense listed as CSIRT member (question cut when the bank was shortened) | n/a | Appendix D table | Retired |
| 21 | RETIRED 2026-11-02: reporting is mandatory; human error excusable (question cut) | n/a | Section 2.3.2 | Retired |
| 22 | Staff FAQ: report promptly to CSIRT, report as soon as aware, do not power off or reimage, disconnect only if instructed, do not delete, forward as attachment, do not pay, law enforcement only if directed or in personal danger, media "not in a position to comment" | detect_what_counts, detect_how_fast, contain_device, contain_outside_contacts (CSIRT framing; the staff path was removed 2026-11-02) | Appendix E, questions 1 to 8 | Verified against template |
| 23 | Carrier notified promptly; breach counsel via carrier hotline; forensics engaged through counsel | contain_carrier_counsel | Sections 3.1, 3.6; Appendix C | Verified against template |
| 24 | Halt fund transfers; stop all money movement and verify out of band | contain_money_movement | Section 3.4; Appendix A | Verified against template |
| 25 | No retaliation against the attacker; protect logs and VM snapshots | contain_device explanation | Sections 3.2, 3.4 | Verified against template |
| 26 | After-action analysis for all incidents, held promptly after closing | recover_after_action | Section 3.10 | Verified against template |
| 27 | RETIRED 2026-11-02: incident log maintained in compliance files (question cut) | n/a | Section 3 introduction; Appendix B | Retired |
| 28 | Section numbering 1 to 4 with subsections, Appendices A to F | every irp_ref | Template table of contents; heading styles in document.xml | [VERIFY] visual check in Word (see discrepancies item 7) |

## Contact details

| # | Claim | Where | Source | Status |
|---|---|---|---|---|
| 29 | AdvisorDefense phone (800) 456-5357 | footer, PDF | Reg S-P app source log item 16 (confirmed by the Founder and CEO, 2026-10-29) | Verified |
| 30 | Support@AdvisorDefense.com as the client contact line | footer, PDF, login page | IRP Appendix D lists Support@advisordefense.com for the CSIRT | Supported. Confirm this is the right inbox for client questions about the tool. |
