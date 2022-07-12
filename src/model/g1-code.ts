export interface G1Code {
  prefixObjectKey: string;
  id: string;
  objectType: string;
  objectKey: string;
  changeLogComment: string | null;
  createdBy: string | null;
  createdDate: number | null;
  modifiedBy: string | null;
  modifiedDate: number | null;
  // modifiedTimestamp: null;
  createdByName: string | null;
  modifiedByName: string | null;
  createdDateField: number | null;
  modifiedDateField: number | null;
  createdMode: string | null;
  modifiedMode: string | null;
  recordIndex: number | null;
  readOnly: boolean;
  backgroundUpdate: boolean;
  g1Code: string;
  description: string;
  companyCode: string | null;
  activationStatus: string | null;
  companyName: string | null;
  RowId: string;
  // highlight: null;
}
