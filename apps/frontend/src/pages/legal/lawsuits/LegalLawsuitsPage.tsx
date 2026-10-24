import { LegalMattersListPage } from "../matters/LegalMattersListPage";

/**
 * LEAD 443.332 / 443.334 (owner 10-24 3:47 PM CT): "the lawsuits should only be in lawsuits module, it is unnecessary in
 * insurance." Your Legal design keeps lawsuits as legal matters (type "lawsuit") — the canonical record with the reserve
 * JE and the driver / unit / load / claim links. This page is that board locked to type "lawsuit"; the old
 * insurance.lawsuit list (only coder test rows, purged under AUTH-465) is no longer read here.
 * /insurance/lawsuits redirects here, query string kept.
 */
export function LegalLawsuitsPage() {
  return <LegalMattersListPage fixedType="lawsuit" />;
}
