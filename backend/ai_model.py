import os
import cv2
import numpy as np
import base64
from ultralytics import YOLO

class AI_Model:
    def __init__(self):
        """Initializes model paths for the local environment."""
        self.person_path = r"C:\Users\mir\Desktop\FYP\vision-web\vision-ai-backend\Models\yolov8n.pt"
        self.gear_path = r"C:\Users\mir\Desktop\FYP\vision-web\vision-ai-backend\Models\best.pt"
        self.person_model = None
        self.gear_model = None

    def load_model(self):
        """Loads weights into memory for the FastAPI lifecycle."""
        try:
            self.person_model = YOLO(self.person_path)
            self.gear_model = YOLO(self.gear_path)
            print("--- SYSTEM: Sequential Pipeline Online (Type-Safe) ---")
        except Exception as e:
            print(f"CRITICAL ERROR: Failed to load weight files: {e}")

    def draw_detections(self, frame, detections, equipment_list):
        """
        Draw all detections on the original frame with confidence scores.
        Returns the annotated frame.
        """
        annotated = frame.copy()
        
        for det in detections:
            confidence = det.get('confidence', 0.0)
            hex_color = det["color"].lstrip('#')
            color = tuple(int(hex_color[i:i+2], 16) for i in (4, 2, 0))  # BGR format
            
            if det["type"] == "box":
                # Draw person bounding box
                x1, y1, x2, y2 = det["coords"]
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 6)
                
                # Add label with confidence
                label_text = f"{det['label'].upper()} {confidence:.2f}"
                cv2.putText(annotated, label_text, (x1, y1-15), 
                           cv2.FONT_HERSHEY_SIMPLEX, 1.8, color, 4)
            
            elif det["type"] == "polygon":
                # Draw gear polygons
                pts = np.array(det["coords"], dtype=np.int32)
                cv2.polylines(annotated, [pts], True, color, 6)
                
                # Add label with confidence at centroid
                if len(pts) > 0:
                    M = cv2.moments(pts)
                    if M["m00"] != 0:
                        cx = int(M["m10"] / M["m00"])
                        cy = int(M["m01"] / M["m00"])
                        label_text = f"{det['label'].upper()} {confidence:.2f}"
                        cv2.putText(annotated, label_text, (cx-50, cy), 
                                   cv2.FONT_HERSHEY_SIMPLEX, 1.5, color, 4)
        
        # Add status text overlay - ONLY Person, Rope, Harness
        y_offset = 70
        status_items = {
            "Person": True,
            "Rope": "rope" in equipment_list,
            "Harness": "harness" in equipment_list
        }
        
        for item_name, is_ok in status_items.items():
            text = f"{item_name}: {'OK' if is_ok else 'MISSING'}"
            color = (0, 255, 0) if is_ok else (0, 0, 255)  # Green or Red
            cv2.putText(annotated, text, (40, y_offset), 
                       cv2.FONT_HERSHEY_SIMPLEX, 1.8, color, 5)
            y_offset += 80
        
        return annotated

    def run_inference(self, frame):
        """
        Hierarchical Inference:
        1. Detect Person -> 2. Crop to Person ROI -> 3. Detect Gear in Crop.
        Returns annotated image as base64 for frontend display.
        """
        if self.person_model is None or self.gear_model is None:
            return {"status": "Error", "message": "Neural Engines Offline."}

        detections_to_send = []
        gears_found = []
        
        # Get ORIGINAL image dimensions
        img_h, img_w = frame.shape[:2]
        orig_res = [int(img_w), int(img_h)]
        
        print(f"🔍 AI Model received frame: {img_w}x{img_h}")
        
        # 1. PRIMARY DETECTION: Person
        p_results = self.person_model.predict(frame, conf=0.45, verbose=False)[0]
        person_box = None
        person_confidence = 0.0

        if p_results.boxes:
            for box in p_results.boxes:
                if int(box.cls[0]) == 0:  # COCO person class
                    coords_raw = box.xyxy[0].tolist()
                    person_box = [int(coords_raw[0]), int(coords_raw[1]), int(coords_raw[2]), int(coords_raw[3])]
                    person_confidence = float(box.conf[0])
                    print(f"👤 Person detected: confidence {person_confidence:.2f}")
                    break 

        if person_box is None:
            return {
                "status": "Not Climber",
                "message": "No person detected.",
                "detections": [],
                "summary": {"equipment": [], "person_found": False, "resolution": orig_res},
                "annotated_image": None
            }

        # 2. SECONDARY DETECTION: Gear inside Person ROI
        x1, y1, x2, y2 = person_box
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(img_w, x2), min(img_h, y2)
        
        person_roi = frame[y1:y2, x1:x2]
        roi_h, roi_w = person_roi.shape[:2]
        
        print(f"✂️  ROI: {roi_w}x{roi_h}, offset: ({x1}, {y1})")

        if person_roi.size > 0 and roi_w > 0 and roi_h > 0:
            g_results = self.gear_model.predict(person_roi, conf=0.15, verbose=False)[0]
            
            if g_results.masks is not None:
                print(f"🎯 Found {len(g_results.masks)} gear items")
                
                for i in range(len(g_results.masks)):
                    label = str(self.gear_model.names[int(g_results.boxes.cls[i])]).lower()
                    confidence = float(g_results.boxes.conf[i])
                    gears_found.append(label)
                    
                    # Get mask and resize to ROI dimensions
                    mask = g_results.masks.data[i].cpu().numpy()
                    mask_resized = cv2.resize(mask, (roi_w, roi_h), interpolation=cv2.INTER_LINEAR)
                    mask_binary = (mask_resized * 255).astype(np.uint8)
                    
                    # Extract contours
                    contours, _ = cv2.findContours(mask_binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    
                    if not contours:
                        continue
                    
                    cnt = max(contours, key=cv2.contourArea)
                    
                    if len(cnt) < 3:
                        continue
                    
                    # Map to FULL image coordinates
                    global_poly = [[float(p[0][0] + x1), float(p[0][1] + y1)] for p in cnt]
                    
                    print(f"  ├─ {label}: confidence {confidence:.2f}")
                    
                    detections_to_send.append({
                        "type": "polygon",
                        "label": label,
                        "coords": global_poly,
                        "confidence": confidence,
                        "color": "#EAB308" if label == "rope" else "#A855F7"
                    })

        # 3. FINAL VERIFICATION LOGIC
        found_set = set(gears_found)
        required = {'rope', 'harness'}
        is_safe = required.issubset(found_set)

        status = "Climber" if is_safe else "Not Climber"
        person_box_color = "#10B981" if is_safe else "#EF4444"

        detections_to_send.insert(0, {
            "type": "box",
            "label": "person",
            "coords": person_box,
            "confidence": person_confidence,
            "color": person_box_color
        })

        if is_safe:
            msg = "Verified: Person detected with all safety gear (Rope, Harness)."
        else:
            missing = required - found_set
            msg = f"Incomplete: Person detected, but missing {', '.join(missing)}."

        print(f"✅ Status: {status}, Equipment: {list(found_set)}")

        # Draw annotations on the ORIGINAL image
        annotated_frame = self.draw_detections(frame, detections_to_send, list(found_set))
        
        # Encode annotated image as base64 JPEG
        _, buffer = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
        annotated_base64 = base64.b64encode(buffer).decode('utf-8')

        return {
            "status": status,
            "message": msg,
            "detections": detections_to_send,
            "summary": {
                "equipment": list(found_set),
                "person_found": True,
                "resolution": orig_res
            },
            "annotated_image": f"data:image/jpeg;base64,{annotated_base64}"
        }