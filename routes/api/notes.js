"use strict";

const express = require('express');
const router = express.Router();
const auth = require('../../services/auth');
const sql = require('../../services/sql');
const utils = require('../../services/utils');
const notes = require('../../services/notes');
const log = require('../../services/log');
const protected_session = require('../../services/protected_session');
const data_encryption = require('../../services/data_encryption');
const RequestContext = require('../../services/request_context');

router.get('/:noteId', auth.checkApiAuth, async (req, res, next) => {
    const noteId = req.params.noteId;

    const detail = await sql.getSingleResult("SELECT * FROM notes WHERE note_id = ?", [noteId]);

    if (!detail) {
        log.info("Note " + noteId + " has not been found.");

        return res.status(404).send({});
    }

    if (detail.is_protected) {
        const dataKey = protected_session.getDataKey(req);

        detail.note_title = data_encryption.decryptString(dataKey, data_encryption.noteTitleIv(detail.note_id), detail.note_title);
        detail.note_text = data_encryption.decryptString(dataKey, data_encryption.noteTextIv(detail.note_id), detail.note_text);
    }

    res.send({
        detail: detail,
        images: await sql.getResults("SELECT * FROM images WHERE note_id = ? order by note_offset", [detail.note_id]),
        loadTime: utils.nowTimestamp()
    });
});

router.post('/:parentNoteId/children', async (req, res, next) => {
    const parentNoteId = req.params.parentNoteId;
    const note = req.body;

    const { noteId, noteTreeId } = await notes.createNewNote(parentNoteId, note);

    res.send({
        'note_id': noteId,
        'note_tree_id': noteTreeId
    });
});

router.put('/:noteId', async (req, res, next) => {
    const note = req.body;
    const noteId = req.params.noteId;
    const reqCtx = new RequestContext(req);

    await notes.updateNote(noteId, note, reqCtx);

    res.send({});
});

router.delete('/:noteTreeId', async (req, res, next) => {
    await sql.doInTransaction(async () => {
        await notes.deleteNote(req.params.noteTreeId);
    });

    res.send({});
});

router.get('/', async (req, res, next) => {
    const search = '%' + req.query.search + '%';

    const result = await sql.getResults("SELECT note_id FROM notes WHERE note_title liKE ? OR note_text LIKE ?", [search, search]);

    const noteIdList = [];

    for (const res of result) {
        noteIdList.push(res.note_id);
    }

    res.send(noteIdList);
});

module.exports = router;