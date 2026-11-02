# IRP template vs. Reg S-P: discrepancies for decision

Compared: AdvisorDefense IRP template 2026, version 1.0 (`reference/irp-template.md`) against the rule text in SEC Release No. 34-100155 (17 CFR 248.30 and 275.204-2(a)(25)). Reviewed 2026-10-30.

Each item lists the IRP text, the rule text, the effect on the question bank and a recommended fix. Questions that depend on an open item are **held out of the bank** until you decide. Their drafts are at the end of this file.

Severity: **High** (the IRP states something the rule contradicts), **Medium** (the IRP is incomplete or uses the wrong frame), **Low** (wording or housekeeping).

---

## 1. Records retention period (High)

**IRP, Section 4:** "the Advisor will maintain the following in accordance with SEC Rule 204-2(a) ... Retention: On-site for 2 years, easily accessible for a total of 6 years." (stated four times)

**Rule:** Release 34-100155 adds the Reg S-P records to 17 CFR 275.204-2(a)(25). The release's recordkeeping table says for registered investment advisers: "All records for five years, the first two in an easily accessible place", citing 275.204-2(e).

**Likely cause:** "Six years, the first two in an easily accessible place" is the period in 248.30(c)(2), which applies only to investment companies that are **not registered** under the Investment Company Act. It does not apply to advisers.

**Effect:** The retention question is held out. As written, a person who learned the IRP would answer "6 years" and be marked against the rule, or "5 years" and be marked against the IRP.

**Recommended fix:** "Retention: five years from the end of the fiscal year during which the last entry was made, the first two years in an appropriate office of the Advisor (Rule 204-2(e)(1))." Many firms keep six years as a house policy. If the client does, say so explicitly as a firm choice that exceeds the rule. [VERIFY the 204-2(e)(1) wording on eCFR before editing the template.]

## 2. Record categories missing from Section 4 (Medium)

**IRP, Section 4:** lists four categories: (a)(1) policies, documentation of unauthorized access and response, notification determinations, and (a)(5)(i) service provider policies.

**Rule, 275.204-2(a)(25):** six categories. The IRP omits **(v)** "written documentation of any contract or agreement entered into pursuant to § 248.30(a)(5)" and **(vi)** "written policies and procedures required ... pursuant to § 248.30(b)(2)" (disposal).

**Effect:** None on the current bank. records_ready lists all six in its help text, citing the rule.

**Recommended fix:** add the two missing bullets to Section 4.

## 3. Client notice contents use GDPR language (High)

**IRP, Section 3.9.1:** the notice should describe the "personal data breach", "categories and approximate number of data subjects", "the name and contact details of the data protection officer", likely consequences, and "measures taken or proposed to be taken by the controller".

**Rule, 248.30(a)(4)(iv)(A) to (H):** describe the incident and type of sensitive customer information; the date, estimated date or date range if reasonably possible to determine; contact information including a telephone number (toll-free if available), email, postal address and a named office; a recommendation to review account statements and report suspicious activity; what a fraud alert is and how to place one; a recommendation to obtain credit reports and have fraudulent information deleted; how to get a free credit report; FTC and usa.gov guidance, a statement encouraging reporting identity theft to the FTC, and the FTC website.

**Gap:** "data protection officer" and "controller" are GDPR terms with no meaning under Reg S-P. Section 3.9.1 omits the date, the four required contact methods, account statement review, fraud alert, credit report, FTC and usa.gov items. Appendix F covers most of these but does not mention usa.gov, and its contact row does not require a postal address or a named office.

**Effect:** The notice-contents knowledge question is held out. notice_template (readiness) stays in: it asks whether the template was checked against the rule, cites Appendix F and the rule, and does not depend on Section 3.9.1.

**Recommended fix:** replace the four bullets in 3.9.1 with the (a)(4)(iv) list. In Appendix F, add the usa.gov reference and make the contact row require phone, email, postal address and a named office.

## 4. Appendix A starts the 30-day clock at "determining" (High)

**IRP, Appendix A, Data Breach, Notification Obligations:** "Provide customer notification as soon as practicable, and no later than 30 days after **determining** that sensitive customer information was, or is reasonably likely to have been, accessed or used without authorization."

**IRP, Section 2.6 and the rule, 248.30(a)(4)(iii):** "after **becoming aware** that unauthorized access to or use of customer information has occurred or is reasonably likely to have occurred".

**Difference:** "determining" invites a reading where the clock waits for the investigation. The rule's trigger is awareness, and it refers to customer information, not only sensitive customer information.

**Effect:** notice_deadline cites Section 2.6 (which matches the rule) and stays in. Its distractor "Within 30 days after the investigation is finished" tests exactly this confusion.

**Recommended fix:** change Appendix A to match Section 2.6 word for word.

## 5. No rule for notice when specific clients cannot be identified (Medium)

**IRP:** silent.

**Rule, 248.30(a)(4)(ii):** if the firm cannot identify which individuals' sensitive customer information was accessed, it must notify all individuals whose sensitive customer information resides in the affected system, unless it reasonably determines a specific individual's was not accessed.

**Effect:** The knowledge question on this rule is held out because there is no IRP section for it to test. scope_data_map (readiness) mentions the rule in its help text and stays in.

**Recommended fix:** add to Section 2.6: "If the Advisor cannot identify which individuals' Sensitive Customer Information was accessed or used without authorization, it will notify all individuals whose Sensitive Customer Information resides in the affected system, unless it reasonably determines that a specific individual's information was not accessed or used."

## 6. 72-hour vendor notice wording and framing (Low)

**IRP, Section 2.7:** "service providers ... must comply with the requirements of Regulation S-P", including "the service provider's ability to notify the Advisor ... within 72 hours of becoming aware of the incident."

**Rule, 248.30(a)(5)(i)(B):** the **firm's** policies must be reasonably designed to ensure providers notify it "as soon as possible, but no later than 72 hours after becoming aware that a breach in security has occurred resulting in unauthorized access to a customer information system maintained by the service provider".

**Difference:** the duty sits with the firm's oversight, not with the vendor "complying with Reg S-P". "Within 72 hours" drops "as soon as possible". The IRP also does not say the firm must start its incident response program on receipt.

**Effect:** vendor_72_hours was cut when the bank went to 15 questions (2026-11-02). vendor_diligence (readiness) asks about the 72-hour commitment using the rule's wording and cites Section 2.7.

**Recommended fix:** "The Advisor's oversight of service providers, through due diligence and monitoring, is designed to ensure each provider notifies the Advisor as soon as possible, but no later than 72 hours after becoming aware of a breach resulting in unauthorized access to a customer information system the provider maintains. On receipt, the CSIRT will initiate this IRP."

## 7. Adoption date (Low)

**IRP, Section 2.6:** "On May 15, 2024, the SEC adopted amendments to Regulation S-P".

**Release 34-100155:** dated May 16, 2024, effective August 2, 2024.

**Effect:** none on the bank. **Recommended fix:** "May 16, 2024". [VERIFY: the SEC press release date, if you prefer to cite it.]

## 8. Section numbering (Low, needs a visual check)

The extracted XML stores no rendered numbers. The table of contents shows 1 INTRODUCTION to 4 MAINTENANCE OF BOOKS AND RECORDS, subsections 1.1 to 3.10, sub-subsections 2.3.1, 2.3.2 and 3.9.1 to 3.9.3, and Appendices A to F. The "INTRODUCTION" heading has its list numbering switched off in the XML (numId 0), while its subsections still show 1.1 to 1.3 in the TOC. The TOC may be stale.

In-text cross-references ("Section 3", Appendices B, D, E and F) are consistent with that outline. Every `irp_ref` in the bank uses it.

**Action:** open the .docx in Word, update the TOC field (F9), and confirm the heading numbers match. If "INTRODUCTION" renders unnumbered, the later sections may render as 1 to 3, which would change every `irp_ref`.

## 9. No annual review statement (Medium)

**IRP:** has a Revision History table but does not say the plan is reviewed annually or after incidents and exercises.

**Service description and Release 34-100155, section II.A:** AdvisorDefense reviews the IRP annually. The SEC says firms generally should consider reviewing and updating response procedures periodically.

**Effect:** roles_annual_review cites "Document Information and Revision History". It stays in.

**Recommended fix:** add to Document Information: "Review: The CSIRT, with AdvisorDefense, reviews this IRP at least annually and after any Level 1 incident or tabletop exercise, and records changes in the Revision History."

## 10. Scope wording in Section 1.2 (Low)

**IRP, Section 1.2:** Reg S-P "requires ... policies and procedures that are reasonably designed to protect the confidentiality of Sensitive Customer Information".

**Rule, 248.30(a)(1) and (2):** the safeguards policies protect **customer information**. Sensitive customer information is the subset that drives notice.

**Effect:** none on the bank. **Recommended fix:** "customer information" in the first sentence.

## 11. Personal name in Appendix C (Low)

Appendix C lists an AdvisorDefense individual's name and phone as the Cybersecurity Consultant contact. The bank uses role titles only, per the copy rules. Consider a role title and the support line in the template so it does not go stale.

---

## Held-out question drafts

Approve, edit or reject each. On approval, add to `src/content/questions.json` and rerun `npm run review:export`.

### records_retention (section 8, knowledge, CSIRT) (depends on item 1)

- Question: How long must the firm keep its Reg S-P records, such as incident documentation and notice decisions?
- Options: **Five years, the first two in an easily accessible place** (correct) / Two years on site, six years in total / Three years / Until the next SEC examination
- Explanation: Advisers keep the Reg S-P records under Rule 204-2(a)(25). Rule 204-2(e) requires five years, the first two in an easily accessible place.
- irp_ref: Section 4 Maintenance of Books and Records (after the fix)
- regsp_ref: 17 CFR 275.204-2(a)(25); 275.204-2(e)
- tie_in: Retention is what lets an examiner test an incident from years ago.

### notice_contents (section 6, knowledge, CSIRT) (depends on item 3)

- Question: Which of these must a Reg S-P client breach notice include?
- Options: **A description of the incident, how to contact the firm, and steps the client can take, such as placing a fraud alert** (correct) / The name of the firm's data protection officer and the controller's measures / Only a statement that an incident occurred / The forensic report and the attacker's identity
- Explanation: 248.30(a)(4)(iv) lists the contents, including the incident and information involved, the date if known, contact information, account review, fraud alerts, credit reports and FTC guidance.
- irp_ref: Section 3.9.1 Notification to Clients; Appendix F (after the fix)
- regsp_ref: 17 CFR 248.30(a)(4)(iv)
- tie_in: A notice missing required content is an exam finding even if it goes out on time.

### notice_unknown_individuals (section 6, knowledge, CSIRT) (depends on item 5)

- Question: The firm knows a system was accessed but cannot tell whose information was viewed. Who must be notified?
- Options: **Every individual whose sensitive customer information is in that system, unless the firm reasonably determines a specific person's was not accessed** (correct) / No one, until specific individuals are identified / Only clients who report suspicious activity / Only clients with accounts over a set dollar value
- Explanation: 248.30(a)(4)(ii).
- irp_ref: Section 2.6 (after the fix)
- regsp_ref: 17 CFR 248.30(a)(4)(ii)
- tie_in: Knowing what each system holds (scope_data_map) is what keeps this notice from reaching every client.
