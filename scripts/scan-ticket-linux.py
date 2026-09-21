"""Conservative traditional scanner: preserve originals, never generate missing pixels/text."""
import csv
import io
import json
import os
from pathlib import Path
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageOps

cv2.setNumThreads(1)
Image.MAX_IMAGE_PIXELS = 60_000_000


def scan(source, destination):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    with Image.open(source) as opened:
        if opened.width * opened.height > 60_000_000:
            raise ValueError('Image too large')
        original = np.array(ImageOps.exif_transpose(opened).convert('RGB'))
        original_format = opened.format
    height, width = original.shape[:2]
    scale = min(1, 1400 / max(height, width))
    small = cv2.resize(original, None, fx=scale, fy=scale)
    gray = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 45, 140)
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    area = small.shape[0] * small.shape[1]
    for contour in contours:
        polygon = cv2.approxPolyDP(contour, 0.025 * cv2.arcLength(contour, True), True)
        ratio = abs(cv2.contourArea(polygon)) / area
        if len(polygon) != 4 or not cv2.isContourConvex(polygon) or not 0.16 < ratio < 0.94:
            continue
        points = polygon.reshape(4, 2).astype(np.float32)
        total, diff = points.sum(axis=1), np.diff(points, axis=1).ravel()
        ordered = np.array([points[np.argmin(total)], points[np.argmin(diff)], points[np.argmax(total)], points[np.argmax(diff)]])
        if len(np.unique(ordered, axis=0)) != 4:
            continue
        sides = [np.linalg.norm(ordered[(i+1) % 4] - ordered[i]) for i in range(4)]
        aspect = max(sides) / max(1, min(sides))
        if 1.15 < aspect < 4.8:
            candidates.append((ratio, ordered / scale))
    cropped = bool(candidates)
    corners = []
    processed = original
    if candidates:
        _, points = max(candidates, key=lambda candidate: candidate[0])
        a, b, c, d = points
        out_width = round(max(np.linalg.norm(b-a), np.linalg.norm(c-d)))
        out_height = round(max(np.linalg.norm(d-a), np.linalg.norm(c-b)))
        transform = cv2.getPerspectiveTransform(points, np.float32([[0,0],[out_width-1,0],[out_width-1,out_height-1],[0,out_height-1]]))
        processed = cv2.warpPerspective(original, transform, (out_width,out_height))
        corners = [[float(x/width),float(y/height)] for x,y in points]
    rotation = 0
    if processed.shape[0] > processed.shape[1]:
        processed = cv2.rotate(processed, cv2.ROTATE_90_CLOCKWISE)
        rotation = 90
    resize = min(1, 1800 / max(processed.shape[:2]))
    processed = cv2.resize(processed, None, fx=resize, fy=resize)
    # OSD only chooses an orthogonal rotation; it never alters ticket lettering.
    orientation_file = destination / 'orientation.png'
    Image.fromarray(processed).save(orientation_file)
    try:
        osd = subprocess.run(['tesseract',str(orientation_file),'stdout','--psm','0'],capture_output=True,text=True,timeout=20,check=False).stdout
        for line in osd.splitlines():
            if line.startswith('Rotate:'):
                degrees = int(line.split(':')[1])
                if degrees in (90,180,270):
                    processed = np.rot90(processed, -(degrees//90)).copy()
                    rotation = (rotation+degrees) % 360
    finally:
        orientation_file.unlink(missing_ok=True)
    image = Image.fromarray(processed)
    image.save(destination / 'processed.jpg',quality=94)
    thumb = image.copy()
    thumb.thumbnail((480,480))
    thumb.save(destination / 'thumbnail.jpg',quality=88)
    alternatives = []
    for mode in (6,11):
        output = subprocess.run(['tesseract',str(destination/'processed.jpg'),'stdout','-l','chi_sim+eng','--psm',str(mode),'tsv'],capture_output=True,text=True,timeout=45,check=True).stdout
        rows = csv.DictReader(io.StringIO(output),delimiter='\t')
        lines = []
        grouped = {}
        for row in rows:
            text = row.get('text','').strip()
            if not text or float(row['conf']) < 0:
                continue
            lines.append({'text':text,'confidence':float(row['conf'])/100,'x':int(row['left'])/image.width,'y':int(row['top'])/image.height,'width':int(row['width'])/image.width,'height':int(row['height'])/image.height})
            key = (row['block_num'],row['par_num'],row['line_num'])
            grouped.setdefault(key,[]).append(lines[-1])
        alternatives.append(lines)
        merged = []
        for words in grouped.values():
            words.sort(key=lambda word:word['x'])
            left,top = min(word['x'] for word in words),min(word['y'] for word in words)
            right,bottom = max(word['x']+word['width'] for word in words),max(word['y']+word['height'] for word in words)
            merged.append({'text':''.join(word['text'] for word in words),'confidence':sum(word['confidence'] for word in words)/len(words),'x':left,'y':top,'width':right-left,'height':bottom-top})
        alternatives.append(merged)
    result = {'version':3,'cropped':cropped,'confidence':0.7 if cropped else 0,'corners':corners,'rotation':rotation,'width':image.width,'height':image.height,'lines':alternatives[0],'alternatives':alternatives,'originalFormat':original_format}
    (destination/'scan.json').write_text(json.dumps(result,ensure_ascii=False))


if __name__ == '__main__':
    os.umask(0o077)
    scan(sys.argv[1],sys.argv[2])
