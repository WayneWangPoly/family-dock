import { getApps, initializeApp } from "firebase-admin/app";
if (!getApps().length)
    initializeApp();
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
const db = getFirestore();
const adminAuth = getAuth();
const googleMapsApiKey = defineSecret("GOOGLE_MAPS_API_KEY");
function assertAuthed(uid) {
    if (!uid)
        throw new HttpsError("unauthenticated", "Login required.");
    return uid;
}
async function assertFamilyMember(familyId, uid) {
    const snap = await db.doc(`families/${familyId}/members/${uid}`).get();
    if (!snap.exists)
        throw new HttpsError("permission-denied", "Not a family member.");
    return snap.data() ?? {};
}
async function assertFamilyParent(familyId, uid) {
    const member = await assertFamilyMember(familyId, uid);
    const role = String(member.role ?? "");
    if (!["parent", "guardian", "owner"].includes(role)) {
        throw new HttpsError("permission-denied", "Parent or guardian role required.");
    }
    return member;
}
function nowIso() {
    return new Date().toISOString();
}
function addDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
}
function randomInviteCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
}
function cleanRole(value) {
    const role = String(value ?? "child").toLowerCase();
    return role === "homestay" ? "homestay" : "child";
}
async function createInviteRecord(args) {
    const familyId = args.familyId;
    const memberId = args.memberId;
    const memberRef = db.doc(`families/${familyId}/members/${memberId}`);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists)
        throw new HttpsError("not-found", "Member not found.");
    const inviteRef = db.collection(`families/${familyId}/member_invites`).doc();
    const inviteCode = randomInviteCode();
    const baseUrl = String(args.baseUrl ?? "").replace(/\/$/, "");
    const registrationLink = baseUrl
        ? `${baseUrl}/register?code=${encodeURIComponent(inviteCode)}`
        : `/register?code=${encodeURIComponent(inviteCode)}`;
    const createdAt = nowIso();
    const invite = {
        id: inviteRef.id,
        family_id: familyId,
        member_id: memberId,
        invite_code: inviteCode,
        registration_link: registrationLink,
        expires_at: addDays(Number(args.expiresInDays ?? 14)),
        used_at: null,
        created_by: args.createdBy ?? null,
        created_at: createdAt,
        updated_at: createdAt,
    };
    await inviteRef.set(invite);
    return { member: { id: memberSnap.id, ...memberSnap.data() }, invite };
}
export const createMemberInvite = onCall({ region: "us-central1" }, async (request) => {
    const uid = assertAuthed(request.auth?.uid);
    const familyId = String(request.data?.familyId ?? request.data?.family_id ?? "");
    const memberId = String(request.data?.memberId ?? request.data?.member_id ?? "");
    if (!familyId || !memberId)
        throw new HttpsError("invalid-argument", "familyId and memberId are required.");
    await assertFamilyParent(familyId, uid);
    const result = await createInviteRecord({
        familyId,
        memberId,
        baseUrl: request.data?.baseUrl ?? request.data?.base_url,
        expiresInDays: Number(request.data?.expiresInDays ?? request.data?.expires_in_days ?? 14),
        createdBy: uid,
    });
    return { ok: true, invite: result.invite, member: result.member };
});
export const bulkMemberInvites = onCall({ region: "us-central1" }, async (request) => {
    const uid = assertAuthed(request.auth?.uid);
    const familyId = String(request.data?.familyId ?? request.data?.family_id ?? "");
    if (!familyId)
        throw new HttpsError("invalid-argument", "familyId is required.");
    await assertFamilyParent(familyId, uid);
    const createdAt = nowIso();
    const baseUrl = request.data?.baseUrl ?? request.data?.base_url;
    const expiresInDays = Number(request.data?.expiresInDays ?? request.data?.expires_in_days ?? 14);
    const results = [];
    if (Array.isArray(request.data?.members) && request.data.members.length > 0) {
        for (const raw of request.data.members) {
            const displayName = String(raw?.display_name ?? raw?.displayName ?? "").trim();
            if (!displayName)
                continue;
            const role = cleanRole(raw?.role);
            const memberRef = db.collection(`families/${familyId}/members`).doc();
            await memberRef.set({
                id: memberRef.id,
                family_id: familyId,
                display_name: displayName,
                role,
                email_hint: raw?.email_hint ?? raw?.emailHint ?? null,
                auth_user_id: null,
                can_login: false,
                active: true,
                created_by: uid,
                created_at: createdAt,
                updated_at: createdAt,
            });
            results.push(await createInviteRecord({
                familyId,
                memberId: memberRef.id,
                baseUrl,
                expiresInDays,
                createdBy: uid,
            }));
        }
    }
    if (Boolean(request.data?.inviteExistingUnlinked ?? request.data?.invite_existing_unlinked)) {
        const memberSnap = await db.collection(`families/${familyId}/members`).limit(200).get();
        for (const docSnap of memberSnap.docs) {
            const member = docSnap.data();
            if (!member.auth_user_id &&
                !member.can_login &&
                ["child", "homestay"].includes(String(member.role))) {
                results.push(await createInviteRecord({
                    familyId,
                    memberId: docSnap.id,
                    baseUrl,
                    expiresInDays,
                    createdBy: uid,
                }));
            }
        }
    }
    return { ok: true, results };
});
export const selfRegisterMember = onCall({ region: "us-central1" }, async (request) => {
    const inviteCode = String(request.data?.inviteCode ?? request.data?.invite_code ?? "")
        .trim()
        .toUpperCase();
    const email = String(request.data?.email ?? "")
        .trim()
        .toLowerCase();
    const password = String(request.data?.password ?? "");
    if (!inviteCode || !email || password.length < 8) {
        throw new HttpsError("invalid-argument", "Invite code, email and password are required.");
    }
    const inviteSnap = await db
        .collectionGroup("member_invites")
        .where("invite_code", "==", inviteCode)
        .limit(1)
        .get();
    if (inviteSnap.empty)
        throw new HttpsError("not-found", "Invite code not found.");
    const inviteDoc = inviteSnap.docs[0];
    const invite = inviteDoc.data();
    if (invite.used_at)
        throw new HttpsError("failed-precondition", "Invite code has already been used.");
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
        throw new HttpsError("deadline-exceeded", "Invite code has expired.");
    }
    const familyId = String(invite.family_id);
    const memberId = String(invite.member_id);
    const memberRef = db.doc(`families/${familyId}/members/${memberId}`);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists)
        throw new HttpsError("not-found", "Member not found.");
    const member = memberSnap.data() ?? {};
    const userRecord = await adminAuth.createUser({
        email,
        password,
        displayName: String(member.display_name ?? "Family member"),
        emailVerified: false,
        disabled: false,
    });
    const batch = db.batch();
    const updatedAt = nowIso();
    const newMemberRef = db.doc(`families/${familyId}/members/${userRecord.uid}`);
    batch.set(newMemberRef, {
        ...member,
        id: userRecord.uid,
        family_id: familyId,
        auth_user_id: userRecord.uid,
        email,
        can_login: true,
        active: true,
        updated_at: updatedAt,
    }, { merge: true });
    if (memberId !== userRecord.uid)
        batch.delete(memberRef);
    batch.set(db.doc(`users/${userRecord.uid}`), {
        uid: userRecord.uid,
        email,
        display_name: member.display_name ?? "Family member",
        default_family_id: familyId,
        created_at: updatedAt,
        updated_at: updatedAt,
    }, { merge: true });
    batch.update(inviteDoc.ref, {
        used_at: updatedAt,
        used_by: userRecord.uid,
        updated_at: updatedAt,
    });
    await batch.commit();
    return { ok: true, uid: userRecord.uid, familyId, memberId: userRecord.uid };
});
export const adminMemberAccountAction = onCall({ region: "us-central1" }, async (request) => {
    const uid = assertAuthed(request.auth?.uid);
    const familyId = String(request.data?.familyId ?? request.data?.family_id ?? "");
    const memberId = String(request.data?.memberId ?? request.data?.member_id ?? "");
    const action = String(request.data?.action ?? "");
    if (!familyId || !memberId || !["reset_password", "disable", "enable"].includes(action)) {
        throw new HttpsError("invalid-argument", "familyId, memberId and valid action are required.");
    }
    await assertFamilyParent(familyId, uid);
    const memberRef = db.doc(`families/${familyId}/members/${memberId}`);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists)
        throw new HttpsError("not-found", "Member not found.");
    const member = memberSnap.data() ?? {};
    const authUid = String(member.auth_user_id ?? member.id ?? memberId);
    if (action === "reset_password") {
        const newPassword = String(request.data?.newPassword ?? request.data?.new_password ?? "");
        if (newPassword.length < 8)
            throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
        await adminAuth.updateUser(authUid, { password: newPassword });
    }
    else if (action === "disable") {
        await adminAuth.updateUser(authUid, { disabled: true });
        await memberRef.set({ can_login: false, active: false, updated_at: nowIso() }, { merge: true });
    }
    else if (action === "enable") {
        await adminAuth.updateUser(authUid, { disabled: false });
        await memberRef.set({ can_login: true, active: true, updated_at: nowIso() }, { merge: true });
    }
    return { ok: true, action, memberId, authUid };
});
export const createFamilyAccount = onCall({ region: "us-central1" }, async (request) => {
    const email = String(request.data?.parentEmail ?? request.data?.parent_email ?? "")
        .trim()
        .toLowerCase();
    const password = String(request.data?.parentPassword ?? request.data?.parent_password ?? "");
    const parentDisplayName = String(request.data?.parentDisplayName ?? request.data?.parent_display_name ?? "Parent").trim();
    const familyName = String(request.data?.familyName ?? request.data?.family_name ?? "Family").trim();
    if (!email || password.length < 8 || !familyName) {
        throw new HttpsError("invalid-argument", "Email, password and family name are required.");
    }
    const userRecord = await adminAuth.createUser({
        email,
        password,
        displayName: parentDisplayName,
        emailVerified: false,
        disabled: false,
    });
    const familyRef = db.collection("families").doc();
    const createdAt = nowIso();
    const batch = db.batch();
    batch.set(familyRef, {
        id: familyRef.id,
        name: familyName,
        timezone: request.data?.timezone ?? "Australia/Adelaide",
        state_region: request.data?.stateRegion ?? request.data?.state_region ?? "SA",
        school_level: request.data?.schoolLevel ?? request.data?.school_level ?? "primary",
        created_by: userRecord.uid,
        created_at: createdAt,
        updated_at: createdAt,
    });
    batch.set(db.doc(`families/${familyRef.id}/members/${userRecord.uid}`), {
        id: userRecord.uid,
        family_id: familyRef.id,
        auth_user_id: userRecord.uid,
        display_name: parentDisplayName,
        role: "parent",
        email,
        can_login: true,
        active: true,
        created_at: createdAt,
        updated_at: createdAt,
    });
    batch.set(db.doc(`users/${userRecord.uid}`), {
        uid: userRecord.uid,
        email,
        display_name: parentDisplayName,
        default_family_id: familyRef.id,
        created_at: createdAt,
        updated_at: createdAt,
    });
    await batch.commit();
    return { ok: true, uid: userRecord.uid, familyId: familyRef.id };
});
export const geocodeFamilyPlaces = onCall({ region: "us-central1", secrets: [googleMapsApiKey] }, async (request) => {
    const uid = assertAuthed(request.auth?.uid);
    const familyId = String(request.data?.familyId ?? request.data?.family_id ?? "");
    if (!familyId)
        throw new HttpsError("invalid-argument", "familyId is required.");
    await assertFamilyParent(familyId, uid);
    const apiKey = googleMapsApiKey.value();
    if (!apiKey) {
        throw new HttpsError("failed-precondition", "GOOGLE_MAPS_API_KEY secret is missing.");
    }
    const placeIds = Array.isArray(request.data?.placeIds ?? request.data?.place_ids)
        ? (request.data?.placeIds ?? request.data?.place_ids).map(String).filter(Boolean)
        : [];
    const geocodeMissingOnly = Boolean(request.data?.geocodeMissingOnly ?? request.data?.geocode_missing_only ?? true);
    const country = String(request.data?.country ?? "AU").trim() || "AU";
    const region = String(request.data?.region ?? "au").trim() || "au";
    const placesRef = db.collection(`families/${familyId}/places`);
    const docs = placeIds.length > 0
        ? await Promise.all(placeIds.map((id) => placesRef.doc(id).get()))
        : (await placesRef.limit(200).get()).docs;
    const now = nowIso();
    const updated = [];
    const failed = [];
    const skipped = [];
    for (const docSnap of docs) {
        if (!docSnap.exists) {
            failed.push({
                id: docSnap.id,
                status: "not_found",
                error: "Place document does not exist.",
            });
            continue;
        }
        const place = docSnap.data() ?? {};
        const existingLat = place.lat;
        const existingLng = place.lng;
        const hasCoordinates = typeof existingLat === "number" && typeof existingLng === "number";
        if (geocodeMissingOnly && hasCoordinates) {
            skipped.push({
                id: docSnap.id,
                status: "already_geocoded",
                lat: existingLat,
                lng: existingLng,
            });
            continue;
        }
        const address = String(place.address ?? "").trim();
        const name = String(place.name ?? place.title ?? "").trim();
        if (!address && !name) {
            await docSnap.ref.set({
                geocode_status: "missing_address",
                geocode_error: "Place has no address or name.",
                geocode_attempted_at: now,
                updated_at: now,
            }, { merge: true });
            failed.push({
                id: docSnap.id,
                status: "missing_address",
                error: "Place has no address or name.",
            });
            continue;
        }
        const query = address || name;
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}` +
            `&region=${encodeURIComponent(region)}` +
            `&components=${encodeURIComponent(`country:${country}`)}` +
            `&key=${encodeURIComponent(apiKey)}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                const body = await response.text();
                const errorMessage = `HTTP ${response.status}: ${body.slice(0, 300)}`;
                await docSnap.ref.set({
                    geocode_status: "http_error",
                    geocode_error: errorMessage,
                    geocode_attempted_at: now,
                    updated_at: now,
                }, { merge: true });
                failed.push({ id: docSnap.id, status: "http_error", error: errorMessage });
                continue;
            }
            const json = await response.json();
            const status = String(json?.status ?? "UNKNOWN");
            const apiError = String(json?.error_message ?? "");
            if (status !== "OK") {
                const errorMessage = apiError || `Google Geocoding returned ${status}.`;
                await docSnap.ref.set({
                    geocode_status: status,
                    geocode_error: errorMessage,
                    geocode_attempted_at: now,
                    updated_at: now,
                }, { merge: true });
                failed.push({ id: docSnap.id, status, error: errorMessage });
                continue;
            }
            const first = json?.results?.[0];
            const location = first?.geometry?.location;
            if (typeof location?.lat !== "number" || typeof location?.lng !== "number") {
                await docSnap.ref.set({
                    geocode_status: "no_location",
                    geocode_error: "Google returned OK but no numeric location.",
                    geocode_attempted_at: now,
                    updated_at: now,
                }, { merge: true });
                failed.push({
                    id: docSnap.id,
                    status: "no_location",
                    error: "Google returned OK but no numeric location.",
                });
                continue;
            }
            const patch = {
                lat: location.lat,
                lng: location.lng,
                formatted_address: String(first.formatted_address ?? ""),
                geocode_place_id: String(first.place_id ?? ""),
                geocode_status: "OK",
                geocode_error: null,
                geocoded_at: now,
                geocode_attempted_at: now,
                updated_at: now,
            };
            await docSnap.ref.set(patch, { merge: true });
            updated.push({ id: docSnap.id, ...patch });
        }
        catch (error) {
            const errorMessage = String(error?.message ?? error);
            await docSnap.ref.set({
                geocode_status: "exception",
                geocode_error: errorMessage.slice(0, 500),
                geocode_attempted_at: now,
                updated_at: now,
            }, { merge: true });
            failed.push({ id: docSnap.id, status: "exception", error: errorMessage.slice(0, 300) });
        }
    }
    return {
        ok: failed.length === 0,
        total: docs.length,
        updated_count: updated.length,
        failed_count: failed.length,
        skipped_count: skipped.length,
        updated,
        failed,
        skipped,
    };
});
export const summarizeLearning = onCall({ region: "us-central1" }, async (request) => {
    const uid = assertAuthed(request.auth?.uid);
    const familyId = String(request.data?.familyId ?? request.data?.family_id ?? "");
    if (!familyId)
        throw new HttpsError("invalid-argument", "familyId is required.");
    await assertFamilyMember(familyId, uid);
    const recordsSnap = await db.collection(`families/${familyId}/learning_records`).limit(80).get();
    const records = recordsSnap.docs.map((item) => item.data());
    const summary = records.length > 0
        ? `Found ${records.length} learning record(s) for the selected range. Review strengths, issues and next steps in the learning records panel.`
        : "No learning records were found for the selected range.";
    let savedId = null;
    if (Boolean(request.data?.saveSummary ?? request.data?.save_summary ?? true)) {
        const ref = db.collection(`families/${familyId}/learning_summaries`).doc();
        savedId = ref.id;
        await ref.set({
            id: ref.id,
            family_id: familyId,
            child_id: request.data?.childId ?? request.data?.child_id ?? null,
            course_name: request.data?.courseName ?? request.data?.course_name ?? null,
            range_type: request.data?.rangeType ?? request.data?.range_type ?? "custom",
            start_date: request.data?.startDate ?? request.data?.start_date ?? null,
            end_date: request.data?.endDate ?? request.data?.end_date ?? null,
            summary,
            record_count: records.length,
            created_by: uid,
            created_at: nowIso(),
            updated_at: nowIso(),
        });
    }
    return { ok: true, summary, record_count: records.length, saved_id: savedId };
});
export const undoFamilyAction = onCall({ region: "us-central1" }, async (request) => {
    const uid = assertAuthed(request.auth?.uid);
    const familyId = String(request.data?.familyId ?? request.data?.family_id ?? "");
    const actionLogId = String(request.data?.actionLogId ?? request.data?.action_log_id ?? "");
    if (!familyId || !actionLogId)
        throw new HttpsError("invalid-argument", "familyId and actionLogId are required.");
    await assertFamilyMember(familyId, uid);
    await db.doc(`families/${familyId}/action_logs/${actionLogId}`).set({
        undone: true,
        undone_by: uid,
        undone_at: nowIso(),
        updated_at: nowIso(),
    }, { merge: true });
    return { ok: true, actionLogId };
});
